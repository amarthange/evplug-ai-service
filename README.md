# ⚡ VoltHub - AI-Powered EV Charging Locator

Welcome to **VoltHub**! The ultimate platform for electric vehicle owners to find, view, and book charging stations effortlessly. We bring together real-time availability, AI-powered predictions, and a sleek user interface to make EV charging a breeze.

## ✨ Features

- **🗺️ Interactive Map**: Discover charging stations around you with real-time markers.
- **🔐 Secure Authentication**: Easy login with Email/Password or Google.
- **⚡ Smart Booking**: Book your charging slot in advance and lock it in.
- **🤖 AI Predictions**: Get smart estimates on station availability using our integrated Machine Learning service.
- **🌙 Beautiful Dark Mode**: A modern, mobile-first design that looks great day or night.

## 🚀 Quick Start

Follow these simple steps to get VoltHub running on your local machine.

### 1. Configure Credentials

Before starting, you need to set up your environment variables. 
> **Important:** Add your API keys in the `.env` file where it says `"add your api key in here"`.

```bash
# Example from .env
VITE_FIREBASE_API_KEY="add your api key in here"
VITE_GOOGLE_MAPS_API_KEY="add your api key in here"
```

*Need help getting these keys? Check out the [Firebase Console](https://console.firebase.google.com/) and [Google Cloud Console](https://console.cloud.google.com/).*

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the App

Start the development server (frontend and backend):

```bash
npm run dev
```

Your app will be available at `http://localhost:5000`.

### 4. Optional Services

**Run the ML Service** (for AI predictions):
```bash
cd ml_service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**Run the Simulator** (to generate live station data):
```bash
cd simulator
python run_simulator.py --station-count 10 --interval-seconds 30 --use-firestore true
```

## 🛠️ Technologies Used

- **Frontend**: React, TypeScript, Tailwind CSS, Mapbox/Google Maps
- **Backend**: Node.js, Express
- **Database**: Firebase Firestore (Real-time NoSQL)
- **AI/ML**: Python, FastAPI, LightGBM

## 📄 License

This project is licensed under the MIT License. Feel free to use, modify, and learn from it!
