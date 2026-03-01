# 🦋 Monarch Wireless
> **Omada Mesh Hotspot Management System** — A full-stack captive portal and admin dashboard for managing an Omada Mesh WiFi hotspot business. 
Built for Monarch Designers, Nairobi. Many Hotspot Management Systems exist but they do not support natively the deployment of a Mesh Network.
I built this for the purpose of deploying Omada Mesh Hotspot network as the foundation of the Monarch Network hyper-local circular economy concept.

<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/c23f07b9-e89c-4724-9a2f-d24e91b31343" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/9bf34c1b-ba56-4502-90a1-53a69708d1f6" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/fda26ad3-c98c-4de8-bdfa-3220d69a8f52" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/856db12b-ec11-41d6-9784-91144263d4b1" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/8cf3d64d-d4a7-4f59-b967-c9899eebf041" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/c3474323-dc3a-4cd8-8d48-1fb590606342" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/d6124eea-b3c0-44d3-ad3a-9d6e2c51cb40" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/caee00b6-bee5-490a-80e2-676f05d04f34" />
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/894c9d7d-567a-45e4-9b80-4e5bbdd7edcb" />



![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat-square&logo=sqlite&logoColor=white)
![M-Pesa](https://img.shields.io/badge/M--Pesa-STK%20Push-00A651?style=flat-square)
![License](https://img.shields.io/badge/license-UNLICENSED-red?style=flat-square)

---

## 📋 Overview

Monarch Wireless is a complete hotspot management platform that handles:
- **Captive portal** — guests connect, pay via M-Pesa, get internet access
- **Admin dashboard** — manage packages, users, vouchers, revenue, and more
- **Omada integration** — automatically authorises MAC addresses via TP-Link Omada controller
- **SMS notifications** — session confirmations via Africa's Talking or custom provider
- **Punchcard loyalty** — reward returning customers with free sessions

---

## ✨ Features

### Captive Portal
- Beautiful mobile-first portal page served at `/portal`
- Package selection with real-time M-Pesa STK Push payment
- Automatic MAC address binding on payment confirmation
- Voucher code redemption
- Punchcard loyalty program (configurable punch target)

### Admin Dashboard
- **Overview** — live KPIs, revenue today, active sessions, admin POS for alternative cash payment.
- **Network** — live connected clients, signal strength, MAC management, connect with Omada Cloud Controller and adopt as many APs as possible.
- **Packages** — create/edit/delete internet packages with pricing, change device count, add promotions.
- **Vouchers** — generate and manage voucher codes.
- **Users** — full user management with session history, loyalty points .
- **Reports** — P&L statement, revenue charts, operating expenses, ROI calculator, print to PDF
- **SMS** — provider management, message templates, send history
- **Settings** — password management, admin accounts, M-Pesa config, email config

### Payments
- M-Pesa STK Push (Daraja API)
- Sandbox and production environments
- Credentials manageable via UI 
- Callback handling and transaction logging

### Security
- JWT authentication with configurable expiry
- Role-based access control (`super_admin`, `site_manager`, `viewer`)
- First-login password change enforcement
- Password reset via email (token-based, 1-hour expiry)
- Audit log for all admin actions
- Helmet.js security headers

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, CSS Modules, Recharts |
| Backend | Node.js, Express.js |
| Database | SQLite via better-sqlite3 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Payments | Safaricom Daraja API (M-Pesa) |
| Email | Nodemailer (cPanel/Gmail SMTP) |
| SMS | Africa's Talking / custom provider |
| WiFi Controller | TP-Link Omada (REST API) |
| Process Manager | PM2 |
| Web Server | Nginx (reverse proxy + SSL) |

---

## 📁 Project Structure

```
monarch-wireless/
├── backend/
│   ├── src/
│   │   ├── app.js              # Express app entry point
│   │   ├── db/
│   │   │   ├── index.js        # DB connection + migrations
│   │   │   └── schema.sql      # Database schema
│   │   ├── middleware/
│   │   │   └── auth.js         # JWT + role middleware
│   │   ├── routes/
│   │   │   ├── auth.js         # Login, password reset
│   │   │   ├── dashboard.js    # KPI aggregates
│   │   │   ├── packages.js     # Package CRUD
│   │   │   ├── vouchers.js     # Voucher management
│   │   │   ├── users.js        # User management
│   │   │   ├── network.js      # Omada network data
│   │   │   ├── mpesa.js        # STK push + callbacks
│   │   │   ├── sms-settings.js # SMS provider config
│   │   │   ├── payment-settings.js # M-Pesa + SMTP config
│   │   │   └── portal.js       # Captive portal endpoints
│   │   ├── services/
│   │   │   ├── mpesa.js        # M-Pesa service
│   │   │   ├── omada.js        # Omada controller service
│   │   │   ├── sms.js          # SMS service
│   │   │   └── punchcard.js    # Loyalty program service
│   │   └── jobs/
│   │       └── session-expiry.js # Cron: expire old sessions
│   ├── public/                 # Captive portal static files
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Routes
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── ForgotPassword.jsx
│   │   │   ├── ResetPassword.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Network.jsx
│   │   │   ├── LiveClients.jsx
│   │   │   ├── Packages.jsx
│   │   │   ├── Vouchers.jsx
│   │   │   ├── Users.jsx
│   │   │   ├── Reports.jsx
│   │   │   ├── Sms.jsx
│   │   │   └── Settings.jsx
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   └── services/
│   │       └── api.js
│   └── package.json
└── README.md
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 20+
- npm

### 1. Clone the repo
```bash
git clone https://github.com/yourname/monarch-wireless.git
cd monarch-wireless
```

### 2. Backend setup
```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run dev
```

### 3. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:3000`.

**Default admin credentials:** `admin` / `admin123` *(change immediately)*

---

## ⚙️ Environment Variables

Create `backend/.env`:

```env
# Server
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# JWT
JWT_SECRET=your_64_character_random_string
JWT_EXPIRES_IN=8h

# M-Pesa (can also be set via Settings UI after deployment)
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=174379
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback

# Omada Controller
OMADA_URL=https://192.168.x.x:8043
OMADA_CLIENT_ID=your_client_id
OMADA_CLIENT_SECRET=your_client_secret
OMADA_SITE_NAME=Your Site
OMADA_SSID=Your SSID
OMADA_OPERATOR_USER=operator_username
OMADA_OPERATOR_PASS=operator_password
OMADA_MOCK=true   # set false in production

# Punchcard
PUNCH_TARGET=10
```

> **Note:** M-Pesa credentials and SMTP email settings can be configured via the admin UI under Settings — no `.env` editing needed after first deployment.

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🌐 Production Deployment (Ubuntu VPS)

### 1. Install dependencies
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

### 2. Upload and install
```bash
# Upload project files to /var/www/monarch-wireless
cd /var/www/monarch-wireless/backend && npm install
cd /var/www/monarch-wireless/frontend && npm install && npm run build
```

### 3. Configure environment
```bash
cp /var/www/monarch-wireless/backend/.env.example /var/www/monarch-wireless/backend/.env
nano /var/www/monarch-wireless/backend/.env
# Fill in all production values
```

### 4. Start with PM2
```bash
cd /var/www/monarch-wireless/backend
pm2 start src/app.js --name monarch-api
pm2 save
pm2 startup
```

### 5. Nginx config
```nginx
server {
    server_name portal.yourdomain.com;

    location /api {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /portal {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
    }

    location / {
        root /var/www/monarch-wireless/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

### 6. SSL
```bash
sudo certbot --nginx -d portal.yourdomain.com
```

### 7. Omada portal URL
In Omada controller → Portal Settings → External Portal URL:
```
https://portal.yourdomain.com/portal
```

---

## 🔐 Default Credentials

| Role | Username | Password |
|---|---|---|
| Super Admin | `admin` | `admin123` |

> ⚠️ You will be forced to change the default password on first login.

---

## 📱 Captive Portal Flow

1. Guest connects to WiFi → redirected to `https://portal.yourdomain.com/portal`
2. Guest selects a package and enters their phone number
3. M-Pesa STK Push sent to their phone
4. Guest approves payment on their phone
5. System receives M-Pesa callback → authorises MAC address via Omada
6. Guest gets internet access for the duration of their package
7. SMS confirmation sent to guest's phone
8. Session expiry cron disconnects guest when time is up

---

## 🧾 Reports & P&L

The Reports page generates a full Profit & Loss statement including:
- Monthly gross revenue broken down by package
- Operating expenses (ISP, hardware amortization, VPS hosting, staff, power, etc.)
- Net profit and profit margin
- ROI calculation
- 30-day revenue bar chart
- Print to PDF functionality

Expenses are fully configurable via the **Expenses** panel — supports monthly recurring and one-time amortized costs.

---

## 📄 License

Private and unlicensed. All rights reserved — Monarch Wireless, Nairobi.
