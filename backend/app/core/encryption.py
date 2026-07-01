"""
Field-level encryption for tenant secrets (WhatsApp access tokens,
outbound webhook signing secrets) stored in PostgreSQL. Uses Fernet
(AES-128-CBC + HMAC). Key comes only from FIELD_ENCRYPTION_KEY.
"""
from cryptography.fernet import Fernet

from app.core.config import settings

_fernet = Fernet(settings.FIELD_ENCRYPTION_KEY.encode())


def encrypt_value(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    return _fernet.decrypt(ciphertext.encode()).decode()
