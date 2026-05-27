import secrets
import string
import bcrypt
import getpass

def generate_secret_key(length=64):
    alphabet = string.ascii_letters + string.digits + "-_"
    return ''.join(secrets.choice(alphabet) for i in range(length))

def generate_password_hash(password):
    # Hash a password for the first time
    # (Using bcrypt, the salt is saved into the hash itself)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

if __name__ == "__main__":
    print("\n" + "="*50)
    print("🔒 VidSage Secret Generator")
    print("="*50 + "\n")
    
    print("1. Generating AUTH_SECRET_KEY...")
    auth_secret = generate_secret_key()
    print(f"\nAUTH_SECRET_KEY=\n{auth_secret}\n")
    
    print("-" * 50)
    print("\n2. Generating AUTH_PASSWORD_HASH")
    print("Please enter a secure password for your admin account (AUTH_PASSWORD).")
    password = getpass.getpass("Enter password: ")
    confirm_password = getpass.getpass("Confirm password: ")
    
    if password != confirm_password:
        print("\n❌ Passwords do not match. Please try again.")
    elif not password:
        print("\n❌ Password cannot be empty.")
    else:
        pwd_hash = generate_password_hash(password)
        print(f"\nAUTH_PASSWORD={password}")
        print(f"AUTH_PASSWORD_HASH=\n{pwd_hash}\n")
        
        print("="*50)
        print("✅ SUCCESS!")
        print("Copy these variables into your Render Environment Variables!")
        print("="*50 + "\n")
