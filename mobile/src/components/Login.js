import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { supabase } from "../services/supabase";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async () => {
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanUsername || !password.trim()) {
      setErrorMessage("Username dan password wajib diisi.");
      return;
    }

    // Validation: No spaces, alphanumeric + underscores only
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMessage("Username hanya boleh berisi huruf, angka, dan underscore (_), tanpa spasi.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    const dummyEmail = `${cleanUsername}@moneytracker.com`;

    try {
      if (isSignUp) {
        // 1. Sign up user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: dummyEmail,
          password: password.trim(),
        });

        if (error) throw error;

        if (data?.user) {
          // 2. Save username and password in public.users table
          const { error: dbError } = await supabase
            .from("users")
            .insert([
              {
                id: data.user.id,
                username: cleanUsername,
                password: password.trim(), // Plaintext password as requested
              },
            ]);

          if (dbError) throw dbError;

          setSuccessMessage("Akun berhasil dibuat dan Anda telah masuk!");
        }
      } else {
        // Sign in using Supabase Auth
        const { error } = await supabase.auth.signInWithPassword({
          email: dummyEmail,
          password: password.trim(),
        });

        if (error) throw error;
      }
    } catch (error) {
      setErrorMessage(error.message || "Terjadi kesalahan autentikasi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.logoOrb}>
              <Text style={styles.logoText}>M</Text>
            </View>
            <Text style={styles.title}>Money Tracker</Text>
            <Text style={styles.subtitle}>
              {isSignUp
                ? "Daftar untuk mengamankan data keuangan Anda"
                : "Masuk untuk memantau pengeluaran Anda"}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Masukkan username"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                secureTextEntry
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {successMessage ? (
              <View style={styles.successBox}>
                <Text style={styles.successText}>{successMessage}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>
                  {isSignUp ? "Daftar Sekarang" : "Masuk"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isSignUp ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setIsSignUp(!isSignUp);
                setErrorMessage("");
                setSuccessMessage("");
              }}
            >
              <Text style={styles.footerLink}>
                {isSignUp ? "Masuk" : "Buat Akun Baru"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0a051b",
    flex: 1,
  },
  scrollContainer: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    width: "100%",
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoOrb: {
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    marginBottom: 16,
    width: 56,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },
  title: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
    textAlign: "center",
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    color: "#ffffff",
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 8,
    paddingVertical: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  errorBox: {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderColor: "rgba(244, 63, 94, 0.2)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  errorText: {
    color: "#f43f5e",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  successBox: {
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  successText: {
    color: "#10b981",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 28,
  },
  footerText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "500",
  },
  footerLink: {
    color: "#ec4899",
    fontSize: 14,
    fontWeight: "700",
  },
});
