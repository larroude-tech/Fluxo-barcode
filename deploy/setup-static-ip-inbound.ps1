# Script para configurar IP estático de ENTRADA para Cloud Run usando Load Balancer
# Uso: .\setup-static-ip-inbound.ps1

$PROJECT_ID = "larroude-data-prod"
$REGION = "us-central1"
$SERVICE_NAME = "fluxo-barcode"
$STATIC_IP_NAME = "fluxo-barcode-static-ip"
$BACKEND_SERVICE_NAME = "fluxo-barcode-backend"
$URL_MAP_NAME = "fluxo-barcode-url-map"
$HTTP_PROXY_NAME = "fluxo-barcode-http-proxy"
$FORWARDING_RULE_NAME = "fluxo-barcode-forwarding-rule"

Write-Host "Configurando IP estatico de ENTRADA para Cloud Run..." -ForegroundColor Green
Write-Host "Project: $PROJECT_ID"
Write-Host "Region: $REGION"
Write-Host "Service: $SERVICE_NAME"
Write-Host ""

# 1. Reservar IP estático global (para Load Balancer)
Write-Host "1. Reservando endereco IP estatico GLOBAL..." -ForegroundColor Yellow
try {
    gcloud compute addresses create $STATIC_IP_NAME `
        --project=$PROJECT_ID `
        --global `
        --network-tier=PREMIUM 2>&1 | Out-Null
    Write-Host "IP estatico criado" -ForegroundColor Green
} catch {
    Write-Host "AVISO: IP pode ja existir, continuando..." -ForegroundColor Yellow
}

$STATIC_IP = gcloud compute addresses describe $STATIC_IP_NAME `
    --project=$PROJECT_ID `
    --global `
    --format="get(address)"

if ([string]::IsNullOrEmpty($STATIC_IP)) {
    Write-Host "ERRO: Nao foi possivel obter o IP estatico. Verifique se o IP foi criado corretamente." -ForegroundColor Red
    exit 1
}

Write-Host "IP estatico reservado: $STATIC_IP" -ForegroundColor Green
Write-Host ""

# 2. Obter URL do Cloud Run service
Write-Host "2. Obtendo URL do Cloud Run service..." -ForegroundColor Yellow
$CLOUD_RUN_URL = gcloud run services describe $SERVICE_NAME `
    --project=$PROJECT_ID `
    --region=$REGION `
    --platform=managed `
    --format="get(status.url)"

if ([string]::IsNullOrEmpty($CLOUD_RUN_URL)) {
    Write-Host "ERRO: Nao foi possivel obter a URL do Cloud Run service." -ForegroundColor Red
    exit 1
}

Write-Host "Cloud Run URL: $CLOUD_RUN_URL" -ForegroundColor Green
Write-Host ""

# 3. Criar Serverless Network Endpoint Group (NEG)
Write-Host "3. Criando Serverless NEG..." -ForegroundColor Yellow
$NEG_NAME = "fluxo-barcode-neg"

try {
    gcloud compute network-endpoint-groups create $NEG_NAME `
        --project=$PROJECT_ID `
        --region=$REGION `
        --network-endpoint-type=serverless `
        --cloud-run-service=$SERVICE_NAME 2>&1 | Out-Null
    Write-Host "Serverless NEG criado" -ForegroundColor Green
} catch {
    Write-Host "AVISO: NEG pode ja existir, continuando..." -ForegroundColor Yellow
}
Write-Host ""

# 4. Criar Backend Service
Write-Host "4. Criando Backend Service..." -ForegroundColor Yellow
try {
    gcloud compute backend-services create $BACKEND_SERVICE_NAME `
        --project=$PROJECT_ID `
        --global `
        --load-balancing-scheme=EXTERNAL `
        --protocol=HTTP 2>&1 | Out-Null
    Write-Host "Backend Service criado" -ForegroundColor Green
} catch {
    Write-Host "AVISO: Backend Service pode ja existir, continuando..." -ForegroundColor Yellow
}
Write-Host ""

# 5. Adicionar NEG ao Backend Service
Write-Host "5. Adicionando NEG ao Backend Service..." -ForegroundColor Yellow
try {
    gcloud compute backend-services add-backend $BACKEND_SERVICE_NAME `
        --project=$PROJECT_ID `
        --global `
        --network-endpoint-group=$NEG_NAME `
        --network-endpoint-group-region=$REGION 2>&1 | Out-Null
    Write-Host "NEG adicionado ao Backend Service" -ForegroundColor Green
} catch {
    Write-Host "AVISO: Backend ja configurado, continuando..." -ForegroundColor Yellow
}
Write-Host ""

# 6. Criar URL Map
Write-Host "6. Criando URL Map..." -ForegroundColor Yellow
try {
    gcloud compute url-maps create $URL_MAP_NAME `
        --project=$PROJECT_ID `
        --default-service=$BACKEND_SERVICE_NAME 2>&1 | Out-Null
    Write-Host "URL Map criado" -ForegroundColor Green
} catch {
    Write-Host "AVISO: URL Map pode ja existir, continuando..." -ForegroundColor Yellow
}
Write-Host ""

# 7. Criar HTTP Proxy
Write-Host "7. Criando HTTP Proxy..." -ForegroundColor Yellow
try {
    gcloud compute target-http-proxies create $HTTP_PROXY_NAME `
        --project=$PROJECT_ID `
        --url-map=$URL_MAP_NAME 2>&1 | Out-Null
    Write-Host "HTTP Proxy criado" -ForegroundColor Green
} catch {
    Write-Host "AVISO: HTTP Proxy pode ja existir, continuando..." -ForegroundColor Yellow
}
Write-Host ""

# 8. Criar Forwarding Rule com IP estático
Write-Host "8. Criando Forwarding Rule com IP estatico..." -ForegroundColor Yellow
try {
    gcloud compute forwarding-rules create $FORWARDING_RULE_NAME `
        --project=$PROJECT_ID `
        --global `
        --load-balancing-scheme=EXTERNAL `
        --address=$STATIC_IP_NAME `
        --target-http-proxy=$HTTP_PROXY_NAME `
        --ports=80 2>&1 | Out-Null
    Write-Host "Forwarding Rule criado" -ForegroundColor Green
} catch {
    Write-Host "AVISO: Forwarding Rule pode ja existir, continuando..." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "================================================================" -ForegroundColor Green
Write-Host "CONFIGURACAO CONCLUIDA!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "IP ESTATICO DE ENTRADA: $STATIC_IP" -ForegroundColor Cyan
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "   1. Aguarde 5-10 minutos para propagacao do DNS" -ForegroundColor White
Write-Host "   2. Acesse seu servico via: http://$STATIC_IP" -ForegroundColor White
Write-Host "   3. (Opcional) Configure SSL/HTTPS adicionando certificado" -ForegroundColor White
Write-Host ""
Write-Host "Para verificar o status:" -ForegroundColor Yellow
Write-Host "   gcloud compute forwarding-rules describe $FORWARDING_RULE_NAME --project=$PROJECT_ID --global" -ForegroundColor Cyan
Write-Host ""
Write-Host "AVISO: Para HTTPS, voce precisara:" -ForegroundColor Yellow
Write-Host "   1. Criar um certificado SSL: gcloud compute ssl-certificates create ..." -ForegroundColor White
Write-Host "   2. Criar um target-https-proxy com o certificado" -ForegroundColor White
Write-Host "   3. Atualizar o forwarding-rule para usar o HTTPS proxy" -ForegroundColor White
