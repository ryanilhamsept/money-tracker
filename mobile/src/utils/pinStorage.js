import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const PIN_KEY = "money_tracker_app_pin";

// expo-secure-store gak kedukung penuh di web -- fallback ke localStorage
// biar testing/preview web nggak nyangkut. Di device asli (Android/iOS)
// tetep pakai Keychain/Keystore lewat SecureStore.
const isWeb = Platform.OS === "web";

export const getStoredPin = async () => {
  if (isWeb) {
    return typeof window !== "undefined" ? window.localStorage.getItem(PIN_KEY) : null;
  }
  return SecureStore.getItemAsync(PIN_KEY);
};

export const savePin = async (pin) => {
  if (isWeb) {
    if (typeof window !== "undefined") window.localStorage.setItem(PIN_KEY, pin);
    return;
  }
  return SecureStore.setItemAsync(PIN_KEY, pin);
};

export const removePin = async () => {
  if (isWeb) {
    if (typeof window !== "undefined") window.localStorage.removeItem(PIN_KEY);
    return;
  }
  return SecureStore.deleteItemAsync(PIN_KEY);
};

export const hasPinSet = async () => {
  const pin = await getStoredPin();
  return Boolean(pin);
};
