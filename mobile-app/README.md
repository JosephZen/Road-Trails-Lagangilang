# Lagangilang Road Trails & Eco-Tourism — Mobile App (Expo & Android APK)

This folder contains the complete, ready-to-run **Expo (React Native)** mobile wrapper for the **Lagangilang Road Trails System** (`https://road-trails-lagangilang.vercel.app/`).

It enables:
1. **Instant Live Testing** via the free **Expo Go** app on any Android device.
2. **Direct-Install Android APK Generation** (`.apk`) via **EAS Build** without needing the Google Play Store or Android Studio on your PC.
3. Native GPS permissions, hardware back button routing, and 1-tap `tel:` phone dialing for **DENR Checkpoints** and **Emergency Hotlines**.

---

## Part 1: How to Test Live in Expo Go

### Prerequisites
- Install [Node.js (v18 or v20 LTS)](https://nodejs.org/)
- Install the **Expo Go** app on your Android phone from the Google Play Store.

### Step-by-Step
1. Open your terminal in this directory:
   ```bash
   cd mobile-app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Expo development server:
   ```bash
   npx expo start
   ```
   *(If your computer and phone are on different Wi-Fi networks or mobile hotspots, run: `npx expo start --tunnel`)*
4. Open **Expo Go** on your Android phone and scan the QR code displayed in your terminal. The app will open full-screen immediately!

---

## Part 2: How to Build a Standalone `.apk` File (No Play Store Needed)

Expo Application Services (EAS) builds your APK in the cloud for free.

### Step-by-Step
1. Install EAS CLI globally:
   ```bash
   npm install -g eas-cli
   ```
2. Log in with your free Expo account (create one at [expo.dev](https://expo.dev)):
   ```bash
   eas login
   ```
3. Configure project (press **Enter / Yes** when prompted):
   ```bash
   eas build:configure
   ```
4. Build the standalone installable `.apk`:
   ```bash
   eas build -p android --profile preview
   ```
5. Once the cloud build finishes (~5–10 minutes), the terminal will provide a **direct download link and QR code** for your `.apk` file.
6. Download the `.apk` file and install it directly on any Android device (or distribute it via Google Drive, Messenger, Bluetooth, or your website).

---

## File Structure
- `App.js`: Full-screen WebView, GPS geolocation permission bridge, and `tel:` dialer interception.
- `app.json`: Android package identifier `com.lagangilang.roadtrails` with fine GPS permissions.
- `eas.json`: Pre-configured with `"buildType": "apk"` under the `preview` profile for direct sideloading.
