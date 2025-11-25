# Authentication API - Blender MCP Server

Complete authentication system with OTP-based login integrated into the MCP server.

---

## 🔐 Authentication Flow

1. **Check if user exists** → `POST /api/auth/check-user`
2. **Register new user** (if not exists) → `POST /api/auth/register`
3. **Send OTP to email** → `POST /api/auth/send-otp`
4. **Verify OTP & Login** → `POST /api/auth/verify-otp`
5. **Logout** → `POST /api/auth/logout`

---

## API Endpoints

### 1. Check User Existence

Check if a user with the given email already exists.

**Endpoint:** `POST /api/auth/check-user`

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/check-user \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\"}"
```

**PowerShell:**
```powershell
$body = @{email="user@example.com"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/check-user" -Method Post -Body $body -ContentType "application/json"
```

**Response:**
```json
{
  "exists": true,
  "user": {
    "email": "user@example.com",
    "firstName": "John"
  }
}
```

---

### 2. Register New User

Register a new user account.

**Endpoint:** `POST /api/auth/register`

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"newuser@example.com\",\"firstName\":\"John\",\"lastName\":\"Doe\",\"companyName\":\"Acme Inc\",\"phoneNumber\":\"+1234567890\"}"
```

**PowerShell:**
```powershell
$body = @{
    email = "newuser@example.com"
    firstName = "John"
    lastName = "Doe"
    companyName = "Acme Inc"
    phoneNumber = "+1234567890"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -Body $body -ContentType "application/json"
```

**Required Fields:**
- `email` (required)
- `firstName` (required)
- `lastName` (required)
- `companyName` (optional)
- `phoneNumber` (optional)

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "email": "newuser@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

### 3. Send OTP

Send a 6-digit OTP code to user's email.

**Endpoint:** `POST /api/auth/send-otp`

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\"}"
```

**PowerShell:**
```powershell
$body = @{email="user@example.com"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/send-otp" -Method Post -Body $body -ContentType "application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email"
}
```

**Note:** OTP expires in 10 minutes. Check your email inbox for the 6-digit code.

---

### 4. Verify OTP & Login

Verify the OTP code and receive authentication tokens.

**Endpoint:** `POST /api/auth/verify-otp`

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"user@example.com\",\"otp\":\"123456\"}"
```

**PowerShell:**
```powershell
$body = @{
    email = "user@example.com"
    otp = "123456"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/auth/verify-otp" -Method Post -Body $body -ContentType "application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Important:**
- Save the `accessToken` and `refreshToken`
- OTP has max 3 attempts before requiring a new one
- OTP is deleted after successful verification

---

### 5. Logout

Invalidate the refresh token and logout.

**Endpoint:** `POST /api/auth/logout`

**cURL:**
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"your-refresh-token-here\"}"
```

**PowerShell:**
```powershell
$body = @{refreshToken="your-refresh-token-here"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/logout" -Method Post -Body $body -ContentType "application/json"
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 🔄 Complete Authentication Flow Example

### PowerShell Complete Flow:

```powershell
$baseUrl = "http://localhost:5000"
$email = "test@example.com"

# Step 1: Check if user exists
Write-Host "1. Checking user..."
$check = @{email=$email} | ConvertTo-Json
$userCheck = Invoke-RestMethod -Uri "$baseUrl/api/auth/check-user" -Method Post -Body $check -ContentType "application/json"

if (-not $userCheck.exists) {
    # Step 2: Register new user
    Write-Host "2. Registering user..."
    $register = @{
        email = $email
        firstName = "Test"
        lastName = "User"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method Post -Body $register -ContentType "application/json"
}

# Step 3: Send OTP
Write-Host "3. Sending OTP..."
$sendOtp = @{email=$email} | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/api/auth/send-otp" -Method Post -Body $sendOtp -ContentType "application/json"

# Step 4: Enter OTP (check your email)
$otp = Read-Host "Enter OTP from email"
$verifyOtp = @{
    email = $email
    otp = $otp
} | ConvertTo-Json
$loginResult = Invoke-RestMethod -Uri "$baseUrl/api/auth/verify-otp" -Method Post -Body $verifyOtp -ContentType "application/json"

Write-Host "Logged in! Access Token: $($loginResult.accessToken)"

# Step 5: Use the API with authentication (example)
# Now you can use $loginResult.accessToken for authenticated requests
```

### cURL Complete Flow:

```bash
# 1. Check user
curl -X POST http://localhost:5000/api/auth/check-user \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\"}"

# 2. Register (if new user)
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"firstName\":\"Test\",\"lastName\":\"User\"}"

# 3. Send OTP
curl -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\"}"

# 4. Verify OTP (replace 123456 with actual OTP from email)
curl -X POST http://localhost:5000/api/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"otp\":\"123456\"}"

# 5. Logout
curl -X POST http://localhost:5000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"your-refresh-token\"}"
```

---

## 🔑 JWT Tokens

**Access Token:**
- Expires in 1 hour
- Use for authenticated API requests
- Send in `Authorization: Bearer <token>` header

**Refresh Token:**
- Expires in 7 days
- Use to get new access token when expired
- Store securely

---

## ⚠️ Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Email is required"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**500 Server Error:**
```json
{
  "success": false,
  "message": "Server error",
  "error": "Error details"
}
```

---

## 📧 Email Configuration

The server sends OTP emails using SMTP. Configuration in `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

For Gmail:
1. Enable 2-factor authentication
2. Generate an app-specific password
3. Use that password in `SMTP_PASSWORD`

---

## 🗄️ Database

Uses MongoDB to store:
- **Users** collection: User accounts
- **OTPs** collection: Temporary OTP codes (auto-expire in 10 min)
- **Tokens** collection: Refresh tokens (auto-expire in 7 days)

---

## ✅ Testing Authentication

Quick test script:

```powershell
# Test registration and login
$email = "test$(Get-Random)@example.com"
Write-Host "Testing with: $email"

# Register
$body = @{email=$email; firstName="Test"; lastName="User"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -Body $body -ContentType "application/json"

# Send OTP
$body = @{email=$email} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/send-otp" -Method Post -Body $body -ContentType "application/json"

Write-Host "Check email: $email for OTP"
```

---

## 🚀 All Endpoints Combined

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/check-user` | Check if user exists |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/send-otp` | Send OTP to email |
| POST | `/api/auth/verify-otp` | Verify OTP & login |
| POST | `/api/auth/logout` | Logout user |
| POST | `/api/prompt` | AI Blender control (unchanged) |
| POST | `/api/blender/execute` | Execute Python (unchanged) |
| GET | `/api/blender/scene` | Get scene info (unchanged) |
| GET | `/health` | Health check (unchanged) |

**Auth endpoints are now integrated without disturbing existing Blender/MCP endpoints!** ✅
