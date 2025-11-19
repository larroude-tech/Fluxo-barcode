
import win32print
import time

def test_usb_connection():
    printer_name = "ZDesigner ZD621R-203dpi ZPL"
    
    try:
        # Verificar se impressora existe
        handle = win32print.OpenPrinter(printer_name)
        
        # Obter informações
        info = win32print.GetPrinter(handle, 2)
        
        result = {
            "success": True,
            "printer_name": info['pPrinterName'],
            "port": info['pPortName'],
            "driver": info['pDriverName'],
            "status": info['Status'],
            "jobs_in_queue": info['cJobs'],
            "online": info['Status'] == 0
        }
        
        win32print.ClosePrinter(handle)
        
        print("SUCCESS:" + str(result).replace("'", '"').replace('True', 'true').replace('False', 'false'))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e)
        }
        print("ERROR:" + str(error_result).replace("'", '"').replace('True', 'true').replace('False', 'false'))

if __name__ == "__main__":
    test_usb_connection()
