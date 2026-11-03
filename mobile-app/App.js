import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  BackHandler,
  Platform,
  Linking,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Network from 'expo-network';

const WEB_APP_URL = 'https://road-trails-lagangilang.vercel.app/';

export default function App() {
  const webViewRef = useRef(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [hasWebError, setHasWebError] = useState(false);

  // Request native Android GPS permissions on startup
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setHasLocationPermission(status === 'granted');
      } catch (e) {
        console.warn('Location permission request failed:', e);
      }
    })();
  }, []);

  // Monitor network connectivity
  useEffect(() => {
    (async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        setIsConnected(networkState.isConnected);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // Handle Android hardware Back Button inside the map/streetview
  useEffect(() => {
    if (Platform.OS === 'android') {
      const onBackPress = () => {
        if (webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }
  }, []);

  // Intercept 'tel:' hotline links so clicking a Hotline or DENR Checkpoint dials immediately
  const handleShouldStartLoadWithRequest = (request) => {
    const { url } = request;
    if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('sms:')) {
      Linking.openURL(url).catch((err) => {
        console.warn('Could not launch external URL handler:', err);
      });
      return false;
    }
    return true;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" translucent={false} backgroundColor="#0f172a" />

      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        allowsFullscreenVideo={true}
        cacheEnabled={true}
        cacheMode="LOAD_DEFAULT"
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        startInLoadingState={true}
        onError={() => setHasWebError(true)}
        onLoadEnd={() => setHasWebError(false)}
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#15803D" />
            <Text style={styles.loadingTitle}>🌲 Lagangilang Road Trails</Text>
            <Text style={styles.loadingSubtitle}>Eco-Tourism & 360° Trail Explorer</Text>
          </View>
        )}
      />

      {/* Offline / Connection Error Banner */}
      {hasWebError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorIcon}>📡</Text>
          <Text style={styles.errorTitle}>Offline or Loading from Device Cache</Text>
          <Text style={styles.errorDesc}>
            If you have downloaded the Offline Map package, your cached trails, POIs, and DENR Checkpoints remain accessible.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setHasWebError(false);
              webViewRef.current?.reload();
            }}
          >
            <Text style={styles.retryBtnText}>🔄 Retry Connection</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0,
  },
  webview: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loader: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    zIndex: 10,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#34d399',
    letterSpacing: -0.2,
  },
  loadingSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  errorOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  errorIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fbbf24',
    textAlign: 'center',
  },
  errorDesc: {
    fontSize: 12,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
