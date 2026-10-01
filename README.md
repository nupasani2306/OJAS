# OJAS – Smart Wearable Health & Emergency Assistance System

OJAS is a smart wearable-based health monitoring and emergency assistance system designed to help users monitor important health parameters and quickly respond to emergency situations.

The system combines an ESP32-C3 based wearable device with a Flutter mobile application, Flask backend, PostgreSQL database, and cloud storage.

---

## 🚀 Features

### Health Monitoring
- Heart Rate monitoring
- SpO₂ monitoring
- Step counting
- Calorie tracking
- Sleep monitoring
- Water intake tracking

### Emergency Assistance
- Automatic fall detection
- Emergency countdown and cancellation
- Manual SOS button
- Emergency contact management
- Emergency and SOS messages
- Emergency alert processing

### Medical Profile
- Blood group
- Allergies
- Medical conditions
- Medications
- Height and weight
- Medical notes
- Medical document storage
- Medical ID / QR functionality

### Fitness
- Workout tracking
- Workout goals
- Exercise and set tracking
- Workout history

### Mobile Application
- User registration and login
- Health dashboard
- Live monitoring
- Health history
- Emergency contacts
- Medical profile
- Device management
- Beast Mode / workout tracking
- Chatbot
- Settings

---

## 🏗️ System Architecture

```text
                 ┌──────────────────────┐
                 │      OJAS Wearable   │
                 │                      │
                 │      ESP32-C3        │
                 │         │            │
                 │   ┌─────┴─────┐      │
                 │   │ Sensors   │      │
                 │   │           │      │
                 │   │ MAX30102  │      │
                 │   │ MPU6050   │      │
                 │   │ SOS Button│      │
                 │   └───────────┘      │
                 └──────────┬───────────┘
                            │
                           BLE
                            │
                            ▼
                 ┌──────────────────────┐
                 │    Flutter Mobile    │
                 │        App           │
                 └──────────┬───────────┘
                            │
                         HTTPS/REST
                            │
                            ▼
                 ┌──────────────────────┐
                 │     Flask Backend    │
                 │                      │
                 │ Authentication       │
                 │ Business Logic       │
                 │ Health APIs           │
                 │ Emergency APIs        │
                 │ File Upload           │
                 └──────────┬───────────┘
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
          ┌──────────────┐    ┌────────────────┐
          │ PostgreSQL   │    │ Cloud Storage  │
          │   Database   │    │ Medical Docs   │
          └──────────────┘    └────────────────┘
