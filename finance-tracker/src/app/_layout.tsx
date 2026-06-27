import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

// Prevent the native splash screen from hiding automatically while we mount our view
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    async function prepareApp() {
      try {
        // Simulate initial setup (checking Firebase auth, loading local storage, etc.)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        setIsAppReady(true);
        // Hide the ugly system loading screen so our beautiful custom one shows
        await SplashScreen.hideAsync();
      }
    }

    prepareApp();
  }, []);

  // 1. THIS IS YOUR PROFESSIONAL LOADING/LANDING VIEW
  if (!isAppReady) {
    return (
      <View style={styles.container}>
        {/* Your Blue App Logo Asset */}
        <Image
          source={require("../../assets/images/splash-icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Main Title */}
        <Text style={styles.title}>Finance Tracker</Text>

        {/* Small, natural, understated subtitle */}
        <Text style={styles.subtitle}>Made by Keljo</Text>

        {/* Minimalist loading spinner matching your theme color */}
        <ActivityIndicator size="small" color="#208AEF" style={styles.loader} />
      </View>
    );
  }

  // 2. ONCE LOADED, RENDER THE MAIN APP HOOKS
  return <Slot />;
}

// 2. DESIGN STYLES FOR THE PERFECT VISUAL HIERARCHY
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF", // Clean professional white background
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0F172A", // Deep dark slate instead of harsh pure black
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: "#94A3B8", // Light slate gray to make it beautifully subtle and less visible
    letterSpacing: 0.5,
  },
  loader: {
    marginTop: 40,
  },
});
