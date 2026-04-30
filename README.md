# 🌟 Nexus - Your Centralized Research Hub

**Nexus** is a full-stack, collaborative research hub and note-taking application. It is designed to help researchers, students, and professionals organize their knowledge, share insights, and collaborate effectively. 

If you are looking for a centralized place to store your research materials, categorize them by topic, discuss findings with peers, and quickly retrieve information through powerful search—**Nexus is built for you.**

---

## 🚀 Why Nexus? (The Problem it Solves)
Often, research materials and notes are scattered across different platforms—local folders, cloud storage, physical notebooks, and various note-taking apps. **Nexus solves this by providing a unified workspace.** 

With Nexus, you can:
- **Centralize Knowledge:** Keep all your notes, links, and uploaded files in one place.
- **Stay Organized:** Group your research into specific topics so you never lose track of a thought.
- **Collaborate Seamlessly:** Leave comments on research items to discuss ideas with others.
- **Find Things Instantly:** Use the built-in search to locate exact phrases, notes, or files within seconds.

---

## ✨ Key Features

- 🔐 **Secure Authentication:** 
  - Standard Email/Password Registration with OTP Email Verification.
  - Seamless "Sign in with Google" (OAuth 2.0).
- 📂 **Topic-Based Organization:** Create specific topics (e.g., "Machine Learning", "History of Art") and organize your notes within them.
- 📎 **File Uploads:** Don't just write notes—attach PDFs, images, and other critical research files directly to your topics.
- 💬 **Interactive Commenting System:** Engage in discussions on specific notes or uploaded files.
- 🔍 **Powerful Search:** Instantly query your entire database of notes, topics, and comments.

---

## 🛠️ Technical Architecture

Nexus is built using a modern, robust, and scalable tech stack:

- **Frontend (Client-side):** 
  - Pure **HTML5, CSS3, and Vanilla JavaScript** for a lightweight, fast, and responsive user interface without the overhead of heavy frameworks.
- **Backend (Server-side):** 
  - **Node.js** with **Express.js** providing a fast and flexible RESTful API architecture.
- **Database:** 
  - **MongoDB (Atlas)** for flexible, document-based NoSQL data storage.
- **Authentication & Security:**
  - **JSON Web Tokens (JWT)** for secure session management.
  - **Google Identity Services** for OAuth.
  - **Nodemailer** for sending SMTP verification emails.
- **Deployment:** 
  - Hosted and deployed continuously via **Vercel**.

---

## 📁 File Structure

The project is organized to cleanly separate the frontend client, backend API routes, database models, and server configuration:

```text
nexus/
├── README.md                 # Project documentation
└── Hiteshi Project/          # Main application source folder
    ├── public/               # Frontend Assets (HTML, CSS, Vanilla JS)
    │   ├── index.html        # Main landing and authentication page
    │   ├── app.js            # Frontend logic and DOM manipulation
    │   └── style.css         # Vanilla CSS stylesheets
    ├── models/               # MongoDB Mongoose Schemas (Data Layer)
    │   ├── User.js           # User schema
    │   └── Topic.js          # Topic, Notes, and Comments schema
    ├── routes/               # Express.js API Routes (Controller Layer)
    │   ├── auth.js           # Authentication API endpoints (Login, Register, OTP, Google OAuth)
    │   └── api.js            # Core application endpoints (Topics, Notes, Uploads, Search)
    ├── middleware/           # Express Middleware
    │   └── auth.js           # JWT verification middleware to protect private routes
    ├── uploads/              # Local directory for user-uploaded research files
    ├── server.js             # Express Server entry point and backend setup
    ├── package.json          # Node.js dependencies and scripts
    └── vercel.json           # Vercel deployment configuration
```

---

## ⚙️ Setup and Local Development

Follow these steps to get a local copy of Nexus up and running on your machine.

### 1. Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- A [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) account (or a local MongoDB instance).
- A Google Cloud Project with OAuth 2.0 credentials (for Google Sign-In).

### 2. Clone the Repository
```bash
git clone https://github.com/hiteshi516/nexus.git
cd nexus
```

### 3. Install Dependencies
Navigate into the `Hiteshi Project` folder where the server code resides and install the Node.js packages:
```bash
cd "Hiteshi Project"
npm install
```

### 4. Environment Variables
Create a `.env` file in the root directory (where `server.js` is located) and add the following keys. You will need to provide your own values:

```env
# Database Connection
MONGO_URI=your_mongodb_connection_string

# Server Configuration
PORT=5000

# Authentication & Security
JWT_SECRET=your_jwt_secret_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id

# Email Verification (SMTP configuration for Nodemailer)
SMTP_EMAIL=your_email_address@gmail.com
SMTP_APP_PASSWORD=your_email_app_password

# DNS Configuration (Optional)
FORCE_PUBLIC_DNS=true
```

### 5. Start the Server
Run the application in development mode:
```bash
npm start
```

The server will typically start on `http://localhost:5000`. You can then open your browser and navigate to the local server address to use Nexus!

---

## 🌐 Live Demo
nexus-research-hub.vercel.app
