from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class BusinessError(Exception):
    def __init__(self, message: str, code: str = "business_error", status_code: int = 409):
        self.message = message
        self.code = code
        self.status_code = status_code


def error_response(status_code: int, code: str, message: str, details=None):
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message, "details": details or []}})


async def http_exception_handler(request: Request, exc: HTTPException):
    messages = {404: "Recurso no encontrado", 409: "Conflicto con el estado actual"}
    detail = exc.detail if isinstance(exc.detail, str) else messages.get(exc.status_code, "Error HTTP")
    return error_response(exc.status_code, f"http_{exc.status_code}", detail)


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = [{"field": ".".join(map(str, item.get("loc", []))), "message": item.get("msg", "Valor invalido"), "type": item.get("type", "invalid")} for item in exc.errors()]
    return error_response(422, "validation_error", "Error de validacion", details)


async def business_exception_handler(request: Request, exc: BusinessError):
    return error_response(exc.status_code, exc.code, exc.message)
