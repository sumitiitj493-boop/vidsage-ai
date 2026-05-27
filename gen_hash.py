import hashlib, base64, os
p = '41312191@Iitj493'
s = os.urandom(16)
d = hashlib.pbkdf2_hmac('sha256', p.encode(), s, 300000)
salt = base64.urlsafe_b64encode(s).decode()
digest = base64.urlsafe_b64encode(d).decode()
print('AUTH_PASSWORD_HASH=pbkdf2_sha256' + '$' + '300000' + '$' + salt + '$' + digest)
