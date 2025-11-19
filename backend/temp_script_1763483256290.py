
import win32print

def list_printers():
    try:
        # Usar flag 2 (PRINTER_ENUM_ALL) para detectar todas as impressoras
        printers = win32print.EnumPrinters(2)
        
        printer_list = []
        for printer in printers:
            printer_info = {
                "name": printer[2],
                "server": printer[1] or "",
                "description": printer[0] or ""
            }
            printer_list.append(printer_info)
        
        result = {
            "success": True,
            "printers": printer_list,
            "count": len(printer_list)
        }
        
        print("SUCCESS:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))

if __name__ == "__main__":
    list_printers()
