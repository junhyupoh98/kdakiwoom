from google.oauth2 import service_account
from google.auth.transport.requests import Request
key_path="gen-lang-client-0148464155-c0c4027f6389.json"
scopes=["https://www.googleapis.com/auth/cloud-platform"]
creds=service_account.Credentials.from_service_account_file(key_path,scopes=scopes)
creds.refresh(Request())
print(creds.token)
