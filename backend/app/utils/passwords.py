import base64


def encode_password(raw_password: str) -> str:
    if raw_password is None:
        return ""
    return base64.b64encode(raw_password.encode("utf-8")).decode("utf-8")


def verify_password(raw_password: str, stored_password: str) -> bool:
    if stored_password is None:
        return False
    return stored_password == encode_password(raw_password)
