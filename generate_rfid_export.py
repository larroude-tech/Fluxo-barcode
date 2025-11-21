#!/usr/bin/env python3
"""
Script para exportar dados da view PostgreSQL para formato Zebra/123RFID
Gera CSV com EPC ID e Asset ID para importação no 123RFID
"""

import os
import sys
import csv
import re
from datetime import datetime
from dotenv import load_dotenv

# Carregar variáveis de ambiente
load_dotenv()

try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("❌ Erro: psycopg2 não está instalado.")
    print("   Execute: pip install psycopg2-binary")
    sys.exit(1)


def build_ssl_config(ssl_mode):
    """Constrói configuração SSL baseada no modo"""
    if not ssl_mode:
        return None
    
    ssl_mode_lower = ssl_mode.lower()
    
    if ssl_mode_lower == 'disable':
        return False
    elif ssl_mode_lower == 'require':
        return {'sslmode': 'require'}
    elif ssl_mode_lower == 'prefer':
        return {'sslmode': 'prefer'}
    elif ssl_mode_lower == 'allow':
        return {'sslmode': 'allow'}
    elif ssl_mode_lower == 'no-verify':
        return {'sslmode': 'require', 'sslcert': None, 'sslkey': None, 'sslrootcert': None, 'sslcrl': None}
    else:
        return {'sslmode': ssl_mode_lower}


def create_db_connection():
    """Cria conexão com PostgreSQL usando variáveis de ambiente"""
    database_url = os.getenv('DATABASE_URL')
    pg_host = os.getenv('PGHOST')
    pg_port = os.getenv('PGPORT')
    pg_user = os.getenv('PGUSER')
    pg_password = os.getenv('PGPASSWORD')
    pg_database = os.getenv('PGDATABASE')
    pg_sslmode = os.getenv('PGSSLMODE')
    
    ssl_config = build_ssl_config(pg_sslmode)
    
    if database_url:
        # Usar connection string
        conn_params = {'dsn': database_url}
        if ssl_config:
            if isinstance(ssl_config, dict):
                conn_params.update(ssl_config)
            else:
                conn_params['sslmode'] = 'disable' if ssl_config is False else 'require'
    else:
        # Usar parâmetros individuais
        conn_params = {
            'host': pg_host or 'localhost',
            'port': int(pg_port) if pg_port else 5432,
            'user': pg_user,
            'password': pg_password,
            'database': pg_database
        }
        if ssl_config:
            if isinstance(ssl_config, dict):
                conn_params.update(ssl_config)
            elif ssl_config is False:
                conn_params['sslmode'] = 'disable'
    
    try:
        conn = psycopg2.connect(**conn_params)
        print("✅ Conexão com PostgreSQL estabelecida com sucesso")
        return conn
    except Exception as e:
        print(f"❌ Erro ao conectar ao PostgreSQL: {e}")
        sys.exit(1)


def generate_zebra_epc_id(barcode, po_number, sequence, target_length=24):
    """
    Gera EPC ID no formato ZebraDesigner
    Formato: [Barcode 12 chars] + [PO sem letras] + [Sequencial] + [Zeros para completar]
    """
    # Garantir que barcode tenha 12 caracteres
    barcode_formatted = str(barcode or '000000000000')[:12].zfill(12)
    
    # PO sem letras (apenas números)
    po_formatted = ''.join(filter(str.isdigit, str(po_number or '0000')))
    
    # Sequencial
    seq_formatted = str(sequence or 1)
    
    # Montar dados base
    base_data = f"{barcode_formatted}{po_formatted}{seq_formatted}"
    
    # Completar com zeros até atingir o tamanho desejado
    epc_id = base_data.ljust(target_length, '0')
    
    return epc_id


def epc_id_to_hex(epc_id):
    """Converte EPC ID numérico para hexadecimal (caso necessário)"""
    try:
        # Converter número para int, depois para hex (sem prefixo 0x)
        hex_value = hex(int(epc_id))[2:].upper()
        return hex_value
    except:
        return epc_id


def create_print_log_table(conn):
    """Cria tabela para rastrear etiquetas impressas se não existir"""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS senda.print_log (
                    id SERIAL PRIMARY KEY,
                    epc_id VARCHAR(24) NOT NULL,
                    barcode VARCHAR(50),
                    vpn VARCHAR(100),
                    po VARCHAR(50),
                    sequence INTEGER,
                    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(epc_id)
                );
                
                CREATE INDEX IF NOT EXISTS idx_print_log_epc_id ON senda.print_log(epc_id);
                CREATE INDEX IF NOT EXISTS idx_print_log_printed_at ON senda.print_log(printed_at);
            """)
            conn.commit()
            print("✅ Tabela de log de impressões verificada/criada")
    except Exception as e:
        print(f"⚠️ Aviso ao criar tabela de log: {e}")
        conn.rollback()


def fetch_printed_labels(conn):
    """Busca apenas etiquetas que foram impressas"""
    # Criar tabela se não existir
    create_print_log_table(conn)
    
    query = """
        SELECT DISTINCT
          pl.epc_id,
          pl.barcode,
          pl.vpn,
          pl.po,
          pl.sequence,
          pl.printed_at,
          v."VPN" AS vpn_from_view,
          v.barcode AS barcode_from_view
        FROM senda.print_log pl
        LEFT JOIN senda.vw_labels_variants_barcode v 
          ON pl.barcode = v.barcode 
          AND pl.po = v.ordem_pedido
        WHERE pl.epc_id IS NOT NULL
          AND pl.epc_id != ''
        ORDER BY pl.printed_at DESC, pl.po, pl.sequence
    """
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
            print(f"✅ {len(rows)} etiqueta(s) impressa(s) encontrada(s)")
            return rows
    except Exception as e:
        print(f"❌ Erro ao buscar etiquetas impressas: {e}")
        raise


def fetch_po_data(conn):
    """Busca todos os dados da view de PO (versão original)"""
    query = """
        SELECT
          ordem_pedido,
          referencia,
          "STYLE NAME" AS style_name,
          description_label,
          sku,
          "VPN" AS vpn,
          barcode,
          qty,
          "COLOR" AS color,
          "SIZE" AS size
        FROM senda.vw_labels_variants_barcode
        WHERE ordem_pedido IS NOT NULL
          AND barcode IS NOT NULL
          AND barcode != ''
          AND "VPN" IS NOT NULL
          AND "VPN" != ''
        ORDER BY ordem_pedido, "STYLE NAME", "SIZE"
    """
    
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
            print(f"✅ {len(rows)} registro(s) encontrado(s) na view")
            return rows
    except Exception as e:
        print(f"❌ Erro ao buscar dados da view: {e}")
        raise


def clean_po_string(po):
    if not po:
        return ''
    po_text = str(po).strip()
    po_text = re.sub(r'(?i)^po\s*', '', po_text)
    return po_text.strip()


def prepare_rfid_data_from_printed(rows):
    """Prepara dados RFID a partir de etiquetas impressas"""
    rfid_records = []
    invalid_count = 0
    
    for row in rows:
        epc_id = str(row.get('epc_id', '')).strip()
        vpn = str(row.get('vpn', '') or row.get('vpn_from_view', '')).strip()
        barcode = str(row.get('barcode', '') or row.get('barcode_from_view', '')).strip()
        po_raw = row.get('po') or row.get('PO') or ''
        po_clean = clean_po_string(po_raw)

        if not epc_id:
            invalid_count += 1
            continue
        
        # Validar formato do EPC ID (deve ser exatamente 24 caracteres numéricos)
        if len(epc_id) != 24 or not epc_id.isdigit():
            print(f"   ⚠️ EPC ID inválido: {epc_id} (tamanho: {len(epc_id)})")
            invalid_count += 1
            continue
        
        # Asset ID usa o VPN se disponível, senão usa barcode
        asset_id = vpn if vpn else barcode
        
        rfid_records.append({
            'epc_id': epc_id,
            'asset_id': asset_id,
            'vpn': vpn,
            'printed_at': row.get('printed_at'),
            'po_clean': po_clean
        })
    
    if invalid_count > 0:
        print(f"   ⚠️ {invalid_count} registro(s) inválido(s) ignorado(s)")
    
    return rfid_records


def prepare_rfid_data(rows):
    """Prepara dados RFID de todas as linhas (versão original para view completa)"""
    rfid_records = []
    po_sequences = {}
    invalid_count = 0
    
    for row in rows:
        po = str(row.get('ordem_pedido', '')).strip()
        barcode = str(row.get('barcode', '')).strip()
        vpn = str(row.get('vpn', '') or row.get('VPN', '')).strip()
        qty = int(row.get('qty', 1))
        
        if not po or not barcode:
            invalid_count += 1
            continue
        
        if po not in po_sequences:
            po_sequences[po] = 0
        
        for i in range(qty):
            po_sequences[po] += 1
            sequence = po_sequences[po]
            epc_id = generate_zebra_epc_id(barcode, po, sequence, target_length=24)
            # Asset ID agora usa o VPN (sku_variant) se disponível, senão usa barcode
            asset_id = vpn if vpn else barcode
            
            # Validar formato do EPC ID (deve ser exatamente 24 caracteres numéricos)
            if len(epc_id) != 24 or not epc_id.isdigit():
                print(f"   ⚠️ EPC ID inválido: {epc_id} (tamanho: {len(epc_id)})")
                invalid_count += 1
                continue
            
            rfid_records.append({
                'epc_id': epc_id,
                'asset_id': asset_id,
                'vpn': vpn
            })
    
    if invalid_count > 0:
        print(f"   ⚠️ {invalid_count} registro(s) inválido(s) ignorado(s)")
    
    return rfid_records


def generate_rfid_csv_atl_simple(rows, output_file='AssetTagList.csv', from_printed=False):
    """Versão ATL - EPC ID + Asset ID (VPN)"""
    if from_printed:
        rfid_records = prepare_rfid_data_from_printed(rows)
    else:
        rfid_records = prepare_rfid_data(rows)
    
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        writer.writerow(['RFID', 'Asset ID', 'PO'])
        for record in rfid_records:
            # EPC ID + Asset ID (VPN)
            writer.writerow([str(record['epc_id']), str(record['asset_id'] or ''), str(record.get('po_clean', ''))])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    print(f"   📝 Formato: EPC ID, Asset ID (VPN), sem cabeçalho")
    if from_printed:
        print(f"   📋 Fonte: Etiquetas impressas (print_log)")
    vpn_count = sum(1 for r in rfid_records if r.get('vpn'))
    print(f"   📊 {vpn_count}/{len(rfid_records)} registros com VPN")
    return output_path


def generate_rfid_csv_atl_epc_only(rows, output_file='AssetTagList_epc_only.csv'):
    """Versão ATL - apenas EPC ID (formato original que funcionou)"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        # Apenas EPC ID, sem cabeçalho
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        for record in rfid_records:
            writer.writerow([str(record['epc_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    print(f"   📝 Formato: apenas EPC ID, sem cabeçalho")
    return output_path


def generate_rfid_csv_taglist(rows, output_file='Taglist.csv'):
    """Versão Taglist.csv - formato oficial do 123RFID"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        # Formato exato: EPC ID,Asset ID (sem espaços após vírgula)
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        writer.writerow(['EPC ID', 'Asset ID'])
        for record in rfid_records:
            # Asset ID = barcode (12 dígitos)
            writer.writerow([str(record['epc_id']), str(record['asset_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    print(f"   📝 Nome: Taglist.csv (formato oficial do 123RFID)")
    return output_path


def generate_rfid_csv_taglist_hex(rows, output_file='Taglist_hex.csv'):
    """Versão Taglist com EPC ID em hexadecimal"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        writer.writerow(['EPC ID', 'Asset ID'])
        for record in rfid_records:
            # Converter EPC ID para hexadecimal
            epc_hex = epc_id_to_hex(record['epc_id'])
            writer.writerow([epc_hex, str(record['asset_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    print(f"   📝 EPC IDs em formato hexadecimal")
    return output_path


def generate_rfid_csv_asset_equals_epc(rows, output_file):
    """Versão: Asset ID igual ao EPC ID"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        writer.writerow(['EPC ID', 'Asset ID'])
        for record in rfid_records:
            # Asset ID igual ao EPC ID
            writer.writerow([str(record['epc_id']), str(record['epc_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    return output_path


def generate_rfid_csv_v1(rows, output_file):
    """Versão 1: Apenas EPC ID, sem aspas (formato igual ao exportado)"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        # QUOTE_MINIMAL - sem aspas, igual ao arquivo exportado
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        writer.writerow(['EPC ID'])
        for record in rfid_records:
            writer.writerow([str(record['epc_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    return output_path


def generate_rfid_csv_v2(rows, output_file):
    """Versão 2: Apenas EPC ID sem cabeçalho, UTF-8 BOM, valores como string"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_ALL)
        for record in rfid_records:
            writer.writerow([str(record['epc_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    return output_path


def generate_rfid_csv_v3(rows, output_file):
    """Versão 3: EPC ID com cabeçalho, UTF-8 sem BOM, valores como string"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_ALL)
        writer.writerow(['EPC ID'])
        for record in rfid_records:
            writer.writerow([str(record['epc_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    return output_path


def generate_rfid_csv_v4(rows, output_file):
    """Versão 4: Formato exato do arquivo exportado (com vírgula no final), valores como string"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_ALL)
        writer.writerow(['EPC ID', ''])  # Vírgula no final como no arquivo exportado
        for record in rfid_records:
            writer.writerow([str(record['epc_id']), ''])  # Vírgula no final
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    return output_path


def generate_rfid_csv_v5(rows, output_file):
    """Versão 5: EPC ID + Asset ID, sem aspas (formato igual ao exportado)"""
    rfid_records = prepare_rfid_data(rows)
    if not rfid_records:
        print("   ⚠️ Nenhum registro")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    # Usar QUOTE_MINIMAL (padrão) - sem aspas, igual ao arquivo exportado
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, delimiter=',', quoting=csv.QUOTE_MINIMAL, lineterminator='\n')
        writer.writerow(['EPC ID', 'Asset ID'])
        for record in rfid_records:
            # Garantir que ambos sejam strings (sem aspas, igual ao exportado)
            writer.writerow([str(record['epc_id']), str(record['asset_id'])])
    
    print(f"   ✅ {output_path} ({len(rfid_records)} registros)")
    print(f"   📝 Formato: sem aspas, igual ao arquivo exportado do 123RFID")
    return output_path


def generate_rfid_csv(rows, output_file='rfid_export_123rfid.csv'):
    """
    Gera CSV no formato 123RFID baseado no formato de exportação do sistema
    Formato observado: "EPC ID" (com espaço) como cabeçalho principal
    """
    rfid_records = []
    
    # Contador de sequenciais por PO
    po_sequences = {}
    
    for row in rows:
        po = str(row.get('ordem_pedido', '')).strip()
        barcode = str(row.get('barcode', '')).strip()
        qty = int(row.get('qty', 1))
        
        if not po or not barcode:
            continue
        
        # Inicializar sequencial para esta PO se necessário
        if po not in po_sequences:
            po_sequences[po] = 0
        
        # Gerar um registro para cada quantidade
        for i in range(qty):
            po_sequences[po] += 1
            sequence = po_sequences[po]
            
            # Gerar EPC ID no formato Zebra (24 caracteres numéricos)
            epc_id = generate_zebra_epc_id(barcode, po, sequence, target_length=24)
            
            # Asset ID: usar o barcode como identificador do ativo
            asset_id = barcode
            
            rfid_records.append({
                'EPC ID': epc_id,
                'Asset ID': asset_id
            })
    
    # Escrever CSV
    if not rfid_records:
        print("⚠️ Nenhum registro para exportar")
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    
    # Formato baseado no arquivo exportado: "EPC ID" com espaço, UTF-8
    # O arquivo exportado mostra "EPC ID" como cabeçalho principal
    try:
        with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
            fieldnames = ['EPC ID', 'Asset ID']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=',', quoting=csv.QUOTE_MINIMAL)
            
            writer.writeheader()
            writer.writerows(rfid_records)
        
        print(f"✅ CSV gerado com sucesso: {output_path}")
        print(f"   Total de registros: {len(rfid_records)}")
        print(f"   Formato: UTF-8 com BOM, delimitador vírgula")
        print(f"   Colunas: 'EPC ID', 'Asset ID' (com espaços, igual ao formato exportado)")
        print(f"   Exemplo EPC ID: {rfid_records[0]['EPC ID'] if rfid_records else 'N/A'}")
        
        return output_path
    except Exception as e:
        print(f"⚠️ Erro ao gerar CSV: {e}")
        raise


def generate_rfid_csv_epc_only(rows, output_file='rfid_export_123rfid_epc_only.csv'):
    """
    Gera CSV apenas com EPC ID (sem Asset ID)
    Alguns sistemas podem aceitar apenas a coluna EPC ID
    """
    rfid_records = []
    
    # Contador de sequenciais por PO
    po_sequences = {}
    
    for row in rows:
        po = str(row.get('ordem_pedido', '')).strip()
        barcode = str(row.get('barcode', '')).strip()
        qty = int(row.get('qty', 1))
        
        if not po or not barcode:
            continue
        
        # Inicializar sequencial para esta PO se necessário
        if po not in po_sequences:
            po_sequences[po] = 0
        
        # Gerar um registro para cada quantidade
        for i in range(qty):
            po_sequences[po] += 1
            sequence = po_sequences[po]
            
            # Gerar EPC ID no formato Zebra
            epc_id = generate_zebra_epc_id(barcode, po, sequence, target_length=24)
            
            rfid_records.append({
                'EPC ID': epc_id
            })
    
    # Escrever CSV
    if not rfid_records:
        return None
    
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_file)
    
    # Versão apenas com EPC ID
    with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        fieldnames = ['EPC ID']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=',', quoting=csv.QUOTE_MINIMAL)
        
        writer.writeheader()
        writer.writerows(rfid_records)
    
    print(f"✅ CSV (apenas EPC ID) gerado: {output_path}")
    print(f"   Formato: UTF-8 com BOM, apenas coluna 'EPC ID'")
    
    return output_path


def main():
    """Função principal"""
    print("=" * 60)
    print("🦓 Exportador RFID Zebra/123RFID")
    print("=" * 60)
    print()
    
    # Conectar ao banco
    conn = create_db_connection()
    
    try:
        # Perguntar se quer apenas etiquetas impressas
        print()
        print("=" * 60)
        print("📋 Escolha a fonte dos dados:")
        print("   1. Apenas etiquetas impressas (recomendado)")
        print("   2. Todas as etiquetas da view")
        print("=" * 60)
        
        choice = input("\nEscolha (1 ou 2, padrão: 1): ").strip() or "1"
        
        if choice == "1":
            print("\n📊 Buscando apenas etiquetas impressas...")
            rows = fetch_printed_labels(conn)
            from_printed = True
        else:
            print("\n📊 Buscando dados da view senda.vw_labels_variants_barcode...")
            rows = fetch_po_data(conn)
            from_printed = False
        
        if not rows:
            print("⚠️ Nenhum dado encontrado")
            return
        
        # Gerar CSV no formato correto (igual ao arquivo exportado)
        print()
        print("📝 Gerando CSV no formato correto para 123RFID...")
        print("   📋 Formato baseado no arquivo exportado do sistema")
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Versão principal: EPC ID + Asset ID (formato correto)
        print("\n✅ Gerando arquivo principal: EPC ID + Asset ID")
        output_file = f'rfid_export_123rfid_{timestamp}.csv'
        output_path = generate_rfid_csv_v5(rows, output_file)
        
        # Versão principal: EPC ID + Asset ID (VPN)
        print("\n✅ Gerando arquivo AssetTagList.csv (EPC ID + VPN)")
        atl_simple_path = generate_rfid_csv_atl_simple(rows, 'AssetTagList.csv', from_printed=from_printed)
        
        # Versão alternativa: apenas EPC ID (caso precise)
        print("\n✅ Gerando arquivo AssetTagList_epc_only.csv (apenas EPC ID)")
        atl_epc_only_path = generate_rfid_csv_atl_epc_only(rows, 'AssetTagList_epc_only.csv')
        
        # Versão com nome Taglist.csv (formato oficial)
        print("\n✅ Gerando arquivo Taglist.csv (formato oficial)")
        taglist_path = generate_rfid_csv_taglist(rows, 'Taglist.csv')
        
        # Versão Taglist com EPC em hexadecimal (caso precise)
        print("\n✅ Gerando Taglist_hex.csv (EPC em hexadecimal)")
        taglist_hex_path = generate_rfid_csv_taglist_hex(rows, 'Taglist_hex.csv')
        
        # Versão alternativa: apenas EPC ID
        print("\n✅ Gerando versão alternativa: apenas EPC ID")
        alt_output_file = f'rfid_export_123rfid_epc_only_{timestamp}.csv'
        alt_output_path = generate_rfid_csv_v1(rows, alt_output_file)
        
        # Versão com Asset ID igual ao EPC ID (caso precise ser igual)
        print("\n✅ Gerando versão com Asset ID = EPC ID")
        alt2_output_file = f'rfid_export_123rfid_asset_equals_epc_{timestamp}.csv'
        alt2_output_path = generate_rfid_csv_asset_equals_epc(rows, alt2_output_file)
        
        print()
        print("=" * 60)
        print("✅ Arquivos gerados com sucesso!")
        print(f"   📁 AssetTagList.csv (formato simples, só EPC): {atl_simple_path}")
        print(f"   📁 Taglist.csv (formato oficial): {taglist_path}")
        print(f"   📁 Taglist_hex.csv (EPC em hex): {taglist_hex_path}")
        print(f"   📁 Principal (EPC + Asset): {output_path}")
        print(f"   📁 Alternativo (só EPC): {alt_output_path}")
        print(f"   📁 Alternativo 2 (Asset=EPC): {alt2_output_path}")
        print()
        print("💡 ORDEM DE TESTE RECOMENDADA:")
        print("   1. AssetTagList.csv (formato mais simples)")
        print("   2. Taglist.csv (nome oficial)")
        print("   3. Taglist_hex.csv (se precisar de hex)")
        print("=" * 60)
        
        if output_path:
            print()
            print("=" * 60)
            print("✅ Exportação concluída com sucesso!")
            print(f"📁 Arquivo: {output_path}")
            print("=" * 60)
        
    except Exception as e:
        print(f"❌ Erro durante a execução: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()
        print()
        print("🔌 Conexão com banco de dados fechada")


if __name__ == '__main__':
    main()

