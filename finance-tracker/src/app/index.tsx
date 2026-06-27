import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../firebaseConfig";

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  createdAt: number;
  userId?: string;
}

const CATEGORIES = [
  "🍔 Food",
  "🚗 Transport",
  "🛍️ Shopping",
  "💡 Bills",
  "🏥 Health",
  "🎮 Entertainment",
  "✨ Other",
];

const CATEGORY_COLORS: { [key: string]: string } = {
  "🍔 Food": "#f97316",
  "🚗 Transport": "#3b82f6",
  "🛍️ Shopping": "#a855f7",
  "💡 Bills": "#eab308",
  "🏥 Health": "#ef4444",
  "🎮 Entertainment": "#06b6d4",
  "✨ Other": "#64748b",
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Reusable Toast Component ───────────────────────────────────────────────
function Toast({
  message,
  type,
  visible,
}: {
  message: string;
  type: "success" | "error";
  visible: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, message]);

  return (
    <Animated.View
      style={[
        toastStyles.container,
        type === "success" ? toastStyles.success : toastStyles.error,
        { opacity },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={type === "success" ? "checkmark-circle" : "alert-circle"}
        size={18}
        color="#fff"
      />
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  success: { backgroundColor: "#16a34a" },
  error: { backgroundColor: "#dc2626" },
  text: { color: "#fff", fontSize: 14, fontWeight: "600", flex: 1 },
});

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const insets = useSafeAreaInsets();

  // --- AUTH STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // --- ACCOUNT PANEL STATE ---
  const [activeDrawerTab, setActiveDrawerTab] = useState<
    "insights" | "account"
  >("insights");
  const [displayName, setDisplayName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // --- EXPENSE STATE ---
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [isFetchingRate, setIsFetchingRate] = useState(false);

  // --- MODAL / FILTER STATE ---
  const [isAnalyticsModalVisible, setIsAnalyticsModalVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // --- TOAST STATE ---
  const [toast, setToast] = useState({
    visible: false,
    message: "",
    type: "success" as "success" | "error",
  });
  const toastKey = useRef(0);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    toastKey.current += 1;
    setToast({ visible: true, message, type });
  };

  // --- AUTH LISTENER ---
  useEffect(() => {
    const checkSession = async () => {
      try {
        const expiry = await AsyncStorage.getItem("sessionExpiry");
        if (expiry && Date.now() > parseInt(expiry, 10)) {
          await signOut(auth);
          await AsyncStorage.removeItem("sessionExpiry");
        }
      } catch (e) {
        console.error("Session check error", e);
      }
    };
    checkSession();

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.displayName) {
        setDisplayName(currentUser.displayName);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // --- FIRESTORE LISTENER (fixed: query only this user's docs) ---
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "expenses"),
      where("userId", "==", user.uid),
    );

    const unsubscribeDB = onSnapshot(q, (snapshot) => {
      const cloudData: Expense[] = [];
      snapshot.forEach((docSnap) => {
        cloudData.push({ id: docSnap.id, ...docSnap.data() } as Expense);
      });
      cloudData.sort((a, b) => b.createdAt - a.createdAt);
      setExpenses(cloudData);
    });

    fetchExchangeRate();
    return () => unsubscribeDB();
  }, [user]);

  // --- EXCHANGE RATE ---
  const fetchExchangeRate = async () => {
    setIsFetchingRate(true);
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/PHP");
      const data = await response.json();
      setUsdRate(data.rates.USD);
    } catch (error) {
      console.error("Network error", error);
    } finally {
      setIsFetchingRate(false);
    }
  };

  // --- VALIDATION ---
  const validateEmailFormat = (inputEmail: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(inputEmail.trim());
  };

  // --- AUTH HANDLERS ---
  const handleSignUp = async () => {
    Keyboard.dismiss();
    if (!validateEmailFormat(email)) {
      Alert.alert(
        "Invalid Email",
        "Please enter a valid email (e.g., name@example.com).",
      );
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters.");
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      // Wait slightly so Firebase has time to emit the auth state to load the dashboard view underneath
      setTimeout(() => {
        setIsLoginMode(true);
        setIsForgotMode(false);
        setShowSessionModal(true);
      }, 500);
      showToast("Account created! Welcome 🎉");
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        Alert.alert("Registration Failed", "This email is already registered.");
      } else {
        Alert.alert("Sign Up Error", error.message);
      }
    }
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (!validateEmailFormat(email)) {
      Alert.alert("Invalid Email", "Please enter a valid email.");
      return;
    }
    if (password === "") {
      Alert.alert("Password Required", "Please enter your password.");
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // Wait slightly so Firebase has time to emit the auth state
      setTimeout(() => {
        setShowSessionModal(true);
      }, 500);
    } catch (error: any) {
      Alert.alert("Authentication Failed", "Incorrect email or password.");
    }
  };

  const handleForgotPassword = async () => {
    Keyboard.dismiss();
    if (!validateEmailFormat(email)) {
      Alert.alert("Email Required", "Please enter a valid email address.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setIsResetModalVisible(true);
    } catch (error: any) {
      Alert.alert(
        "Reset Error",
        "Unable to process reset. Ensure this account exists.",
      );
    }
  };

  const handleCloseResetModal = () => {
    setIsResetModalVisible(false);
    setIsForgotMode(false);
  };

  const handleLogout = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut(auth);
            await AsyncStorage.removeItem("sessionExpiry");
            setExpenses([]);
            setEmail("");
            setPassword("");
            setIsLoginMode(true);
            setIsForgotMode(false);
            setIsDrawerOpen(false);
            setFilterCategory(null);
            setSearchQuery("");
          } catch (error) {
            console.error("Logout Error", error);
          }
        },
      },
    ]);
  };

  // --- SAVE DISPLAY NAME ---
  const handleSaveDisplayName = async () => {
    if (!nameInput.trim()) return;
    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: nameInput.trim(),
        });
        setDisplayName(nameInput.trim());
        setIsEditingName(false);
        showToast("Name updated!");
      }
    } catch (error) {
      showToast("Failed to update name.", "error");
    }
  };

  // --- SESSION HANDLER ---
  const handleSetSession = async (durationMs: number | null) => {
    try {
      if (durationMs) {
        const expiry = Date.now() + durationMs;
        await AsyncStorage.setItem("sessionExpiry", expiry.toString());
      } else {
        await AsyncStorage.removeItem("sessionExpiry");
      }
      setShowSessionModal(false);
      showToast("Session preference saved!");
    } catch (error) {
      console.error("Error saving session", error);
    }
  };

  // --- EXPENSE HANDLERS ---
  const handleAddExpense = async () => {
    const parsedAmount = parseFloat(amount);
    if (!amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a number greater than 0.");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Description Required", "Please add a short description.");
      return;
    }
    try {
      await addDoc(collection(db, "expenses"), {
        amount: parsedAmount,
        description: description.trim(),
        category: selectedCategory,
        createdAt: Date.now(),
        userId: user?.uid,
      });
      setAmount("");
      setDescription("");
      showToast("Expense saved!");
    } catch (error) {
      showToast("Failed to save expense.", "error");
      console.error("Error adding document: ", error);
    }
  };

  const handleDeleteExpense = (idToDelete: string) => {
    Alert.alert("Delete Expense", "Remove this entry? This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "expenses", idToDelete));
            showToast("Expense deleted.");
          } catch (error) {
            showToast("Failed to delete.", "error");
            console.error("Error deleting document: ", error);
          }
        },
      },
    ]);
  };

  // --- STATS ---
  const totalSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalSpentUSD = usdRate ? (totalSpent * usdRate).toFixed(2) : null;

  const getCategoryTotals = () => {
    const totals: { [key: string]: number } = {};
    expenses.forEach((exp) => {
      totals[exp.category] = (totals[exp.category] || 0) + exp.amount;
    });
    return totals;
  };

  const getHighestCategory = () => {
    const totals = getCategoryTotals();
    if (Object.keys(totals).length === 0) return "None yet";
    return Object.keys(totals).reduce((a, b) =>
      totals[a] > totals[b] ? a : b,
    );
  };

  const getThisMonthTotal = () => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.createdAt);
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, e) => sum + e.amount, 0);
  };

  const getJoinedDate = () => {
    if (!user?.metadata?.creationTime) return "—";
    return new Date(user.metadata.creationTime).toLocaleDateString("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // --- FILTERED EXPENSES ---
  const filteredExpenses = expenses.filter((e) => {
    const matchCategory = filterCategory ? e.category === filterCategory : true;
    const matchSearch = searchQuery
      ? e.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchCategory && matchSearch;
  });

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
    });

  // ─── AUTH SCREEN ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.authContainer}
      >
        <ScrollView
          contentContainerStyle={styles.scrollAuthContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isForgotMode ? (
            <View style={styles.authCard}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setIsForgotMode(false)}
              >
                <Ionicons name="arrow-back-outline" size={22} color="#64748b" />
              </TouchableOpacity>

              <View style={[styles.iconCircle, { backgroundColor: "#fff7ed" }]}>
                <Ionicons name="key-outline" size={38} color="#ea580c" />
              </View>

              <Text style={styles.authTitle}>Reset Password</Text>
              <Text style={styles.brandCreditsText}>
                Finance Tracker — Made by Keljo
              </Text>
              <Text style={styles.authSubtitle}>
                Enter your registered email and we'll send you a recovery link.
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.authInput}
                  placeholder="Account email address"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  { backgroundColor: "#ea580c", opacity: email ? 1 : 0.5 },
                ]}
                onPress={handleForgotPassword}
                disabled={!email}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Send Reset Link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.authCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="wallet-outline" size={40} color="#0284c7" />
              </View>

              <Text style={styles.authTitle}>
                {isLoginMode ? "Welcome Back" : "Get Started"}
              </Text>
              <Text style={styles.brandCreditsText}>
                Finance Tracker — Made by Keljo
              </Text>
              <Text style={styles.authSubtitle}>
                {isLoginMode
                  ? "Manage your expenses smoothly"
                  : "Track your cash flow instantly"}
              </Text>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.authInput}
                  placeholder="Email address"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#64748b"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.authInput}
                  placeholder="Password"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIconBtn}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              {isLoginMode && (
                <TouchableOpacity
                  onPress={() => setIsForgotMode(true)}
                  style={styles.forgotBtn}
                >
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.loginButton}
                onPress={isLoginMode ? handleLogin : handleSignUp}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>
                  {isLoginMode ? "Sign In" : "Create Account"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.signUpButton}
                onPress={() => setIsLoginMode(!isLoginMode)}
                activeOpacity={0.6}
              >
                <Text style={styles.signUpText}>
                  {isLoginMode
                    ? "Don't have an account? Sign Up"
                    : "Already have an account? Log In"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Password Reset Success Modal */}
        <Modal
          animationType="fade"
          transparent
          visible={isResetModalVisible}
          onRequestClose={handleCloseResetModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View
                style={[
                  styles.iconCircle,
                  {
                    marginBottom: 16,
                    width: 64,
                    height: 64,
                    backgroundColor: "#f0fdf4",
                  },
                ]}
              >
                <Ionicons name="checkmark-circle" size={36} color="#16a34a" />
              </View>
              <Text style={styles.modalTitle}>Link Dispatched</Text>
              <Text style={styles.modalSubtitle}>
                A reset link was sent to{" "}
                <Text style={styles.boldEmail}>{email.trim()}</Text>. Check your
                inbox.
              </Text>
              <TouchableOpacity
                style={styles.btnModalClose}
                onPress={handleCloseResetModal}
                activeOpacity={0.8}
              >
                <Text style={styles.btnModalCloseText}>Got it, thanks</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // ─── ANALYTICS MODAL ──────────────────────────────────────────────────────
  const categoryTotals = getCategoryTotals();

  // ─── MAIN DASHBOARD ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── SIDEBAR DRAWER ── */}
      {isDrawerOpen && (
        <View style={styles.drawerOverlay} pointerEvents="box-none">
          {/* Transparent clickable background to close drawer */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setIsDrawerOpen(false)}
          />

          {/* Actual Drawer Content */}
          <View
            style={[
              styles.drawerContainer,
              {
                paddingBottom: 22,
                height: undefined,
                flex: 1,
                marginBottom: insets.bottom,
              },
            ]}
          >
            {/* Avatar + email */}
            <View style={styles.drawerHeader}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {(displayName || user.email || "?")[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.drawerDisplayName}>
                {displayName || "Finance User"}
              </Text>
              <Text style={styles.drawerEmail} numberOfLines={1}>
                {user.email}
              </Text>
              <View style={styles.userBadge}>
                <Text style={styles.userBadgeText}>Active Member</Text>
              </View>
            </View>

            {/* Tab Switcher */}
            <View style={styles.drawerTabRow}>
              <TouchableOpacity
                style={[
                  styles.drawerTab,
                  activeDrawerTab === "insights" && styles.drawerTabActive,
                ]}
                onPress={() => setActiveDrawerTab("insights")}
              >
                <Ionicons
                  name="bar-chart-outline"
                  size={15}
                  color={activeDrawerTab === "insights" ? "#0284c7" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.drawerTabText,
                    activeDrawerTab === "insights" &&
                      styles.drawerTabTextActive,
                  ]}
                >
                  Insights
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.drawerTab,
                  activeDrawerTab === "account" && styles.drawerTabActive,
                ]}
                onPress={() => setActiveDrawerTab("account")}
              >
                <Ionicons
                  name="person-outline"
                  size={15}
                  color={activeDrawerTab === "account" ? "#0284c7" : "#94a3b8"}
                />
                <Text
                  style={[
                    styles.drawerTabText,
                    activeDrawerTab === "account" && styles.drawerTabTextActive,
                  ]}
                >
                  Account
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ flex: 1 }}
            >
              {/* ── INSIGHTS TAB ── */}
              {activeDrawerTab === "insights" && (
                <View>
                  {/* Quick stats */}
                  <View style={styles.quickStatsRow}>
                    <View style={styles.quickStatCard}>
                      <Text style={styles.quickStatValue}>
                        {expenses.length}
                      </Text>
                      <Text style={styles.quickStatLabel}>Total Entries</Text>
                    </View>
                    <View style={styles.quickStatCard}>
                      <Text style={styles.quickStatValue}>
                        ₱{getThisMonthTotal().toFixed(0)}
                      </Text>
                      <Text style={styles.quickStatLabel}>This Month</Text>
                    </View>
                  </View>

                  {/* Top category */}
                  <View style={styles.insightCard}>
                    <Ionicons
                      name="trending-up-outline"
                      size={18}
                      color="#0284c7"
                    />
                    <View style={styles.insightTextWrapper}>
                      <Text style={styles.insightLabel}>
                        Top Spending Category
                      </Text>
                      <Text style={styles.insightValue}>
                        {getHighestCategory()}
                      </Text>
                    </View>
                  </View>

                  {/* Category breakdown */}
                  {Object.keys(categoryTotals).length > 0 && (
                    <View style={styles.breakdownSection}>
                      <Text style={styles.insightsTitle}>
                        Spending Breakdown
                      </Text>

                      {/* Back to a simple View so it doesn't fight the main menu! */}
                      <View style={{ marginBottom: 20 }}>
                        {Object.entries(categoryTotals)
                          .sort(([, a], [, b]) => b - a)
                          .map(([cat, total]) => {
                            const pct =
                              totalSpent > 0 ? (total / totalSpent) * 100 : 0;
                            const color = CATEGORY_COLORS[cat] || "#64748b";
                            return (
                              <View key={cat} style={styles.breakdownRow}>
                                <View style={styles.breakdownLabelRow}>
                                  <Text style={styles.breakdownCat}>{cat}</Text>
                                  <Text style={styles.breakdownAmt}>
                                    ₱{total.toFixed(2)}
                                  </Text>
                                </View>
                                <View style={styles.progressTrack}>
                                  <View
                                    style={[
                                      styles.progressFill,
                                      {
                                        width: `${pct}%` as any,
                                        backgroundColor: color,
                                      },
                                    ]}
                                  />
                                </View>
                                <Text style={styles.breakdownPct}>
                                  {pct.toFixed(1)}%
                                </Text>
                              </View>
                            );
                          })}
                      </View>
                    </View>
                  )}

                  {/* Smart tip */}
                  <View style={[styles.insightCard, { marginTop: 4 }]}>
                    <Ionicons name="bulb-outline" size={18} color="#eab308" />
                    <View style={styles.insightTextWrapper}>
                      <Text style={styles.insightLabel}>Smart Tip</Text>
                      <Text style={styles.insightValueBody}>
                        {expenses.length === 0
                          ? "Start logging expenses to see spending insights here."
                          : `Your biggest spend is ${getHighestCategory()}. Try setting a monthly limit for it.`}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* ── ACCOUNT TAB ── */}
              {activeDrawerTab === "account" && (
                <View>
                  {/* Display Name */}
                  <View style={styles.accountSection}>
                    <Text style={styles.accountSectionTitle}>Display Name</Text>
                    {isEditingName ? (
                      <View style={styles.editNameRow}>
                        <TextInput
                          style={styles.editNameInput}
                          value={nameInput}
                          onChangeText={setNameInput}
                          placeholder="Enter your name"
                          placeholderTextColor="#94a3b8"
                          autoFocus
                        />
                        <TouchableOpacity
                          style={styles.saveNameBtn}
                          onPress={handleSaveDisplayName}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.cancelNameBtn}
                          onPress={() => setIsEditingName(false)}
                        >
                          <Ionicons name="close" size={18} color="#64748b" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.accountInfoRow}
                        onPress={() => {
                          setNameInput(displayName);
                          setIsEditingName(true);
                        }}
                      >
                        <Text style={styles.accountInfoValue}>
                          {displayName || "Tap to set a name"}
                        </Text>
                        <Ionicons
                          name="pencil-outline"
                          size={16}
                          color="#0284c7"
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Email */}
                  <View style={styles.accountSection}>
                    <Text style={styles.accountSectionTitle}>
                      Email Address
                    </Text>
                    <View style={styles.accountInfoRow}>
                      <Ionicons name="mail-outline" size={16} color="#64748b" />
                      <Text
                        style={[styles.accountInfoValue, { marginLeft: 8 }]}
                      >
                        {user.email}
                      </Text>
                    </View>
                  </View>

                  {/* Member Since */}
                  <View style={styles.accountSection}>
                    <Text style={styles.accountSectionTitle}>Member Since</Text>
                    <View style={styles.accountInfoRow}>
                      <Ionicons
                        name="calendar-outline"
                        size={16}
                        color="#64748b"
                      />
                      <Text
                        style={[styles.accountInfoValue, { marginLeft: 8 }]}
                      >
                        {getJoinedDate()}
                      </Text>
                    </View>
                  </View>

                  {/* Account Stats */}
                  <View style={styles.accountSection}>
                    <Text style={styles.accountSectionTitle}>Your Stats</Text>
                    <View style={styles.accountStatsGrid}>
                      <View style={styles.accountStatBox}>
                        <Text style={styles.accountStatNum}>
                          {expenses.length}
                        </Text>
                        <Text style={styles.accountStatLabel}>
                          Expenses Logged
                        </Text>
                      </View>
                      <View style={styles.accountStatBox}>
                        <Text style={styles.accountStatNum}>
                          ₱{totalSpent.toFixed(0)}
                        </Text>
                        <Text style={styles.accountStatLabel}>
                          Total Tracked
                        </Text>
                      </View>
                      <View style={styles.accountStatBox}>
                        <Text style={styles.accountStatNum}>
                          {Object.keys(categoryTotals).length}
                        </Text>
                        <Text style={styles.accountStatLabel}>
                          Categories Used
                        </Text>
                      </View>
                      <View style={styles.accountStatBox}>
                        <Text style={styles.accountStatNum}>
                          ₱
                          {expenses.length > 0
                            ? (totalSpent / expenses.length).toFixed(0)
                            : "0"}
                        </Text>
                        <Text style={styles.accountStatLabel}>
                          Avg per Entry
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Email verified badge */}
                  <View style={styles.accountSection}>
                    <Text style={styles.accountSectionTitle}>
                      Account Status
                    </Text>
                    <View style={styles.accountInfoRow}>
                      <Ionicons
                        name={
                          user.emailVerified
                            ? "shield-checkmark"
                            : "shield-outline"
                        }
                        size={16}
                        color={user.emailVerified ? "#16a34a" : "#f59e0b"}
                      />
                      <Text
                        style={[
                          styles.accountInfoValue,
                          {
                            marginLeft: 8,
                            color: user.emailVerified ? "#16a34a" : "#f59e0b",
                          },
                        ]}
                      >
                        {user.emailVerified
                          ? "Email Verified"
                          : "Email Not Verified"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Logout */}
            <TouchableOpacity
              style={styles.drawerLogoutBtn}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="#ef4444" />
              <Text style={styles.drawerLogoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── TOP BAR ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => setIsDrawerOpen(true)}
          style={styles.menuIconBtn}
        >
          <Ionicons name="menu-outline" size={28} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.navBarTitle}>Finance Tracker</Text>
        <TouchableOpacity
          onPress={() => setIsAnalyticsModalVisible(true)}
          style={styles.menuIconBtn}
        >
          <Ionicons name="pie-chart-outline" size={24} color="#0284c7" />
        </TouchableOpacity>
      </View>

      {/* ── MAIN LIST ── */}
      <FlatList
        data={filteredExpenses}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            {/* Balance Card */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Total Spent</Text>
              <Text style={styles.totalAmount}>₱{totalSpent.toFixed(2)}</Text>
              <View style={styles.badge}>
                {isFetchingRate ? (
                  <Text style={styles.usdAmount}>Updating rate...</Text>
                ) : totalSpentUSD ? (
                  <TouchableOpacity
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onPress={fetchExchangeRate}
                  >
                    <Text style={styles.usdAmount}>≈ ${totalSpentUSD} USD</Text>
                    <Ionicons
                      name="refresh-outline"
                      size={12}
                      color="#475569"
                    />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={fetchExchangeRate}>
                    <Text style={styles.usdAmount}>Tap to load USD rate</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* This month stat */}
              <View
                style={[
                  styles.badge,
                  { marginTop: 6, backgroundColor: "#e0f2fe" },
                ]}
              >
                <Text style={[styles.usdAmount, { color: "#0284c7" }]}>
                  This month: ₱{getThisMonthTotal().toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Add Expense Form */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Amount (e.g., 150)"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
              <TextInput
                style={styles.input}
                placeholder="Expense description"
                placeholderTextColor="#94a3b8"
                value={description}
                onChangeText={setDescription}
              />

              <Text style={styles.categoryLabel}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipContainer}
              >
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.chip,
                      selectedCategory === cat
                        ? styles.activeChip
                        : styles.inactiveChip,
                    ]}
                    onPress={() => setSelectedCategory(cat)}
                  >
                    <Text
                      style={
                        selectedCategory === cat
                          ? styles.activeChipText
                          : styles.inactiveChipText
                      }
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.button}
                onPress={handleAddExpense}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={18}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.buttonText}>Save Expense</Text>
              </TouchableOpacity>
            </View>

            {/* Search + Filter */}
            <View style={styles.searchFilterRow}>
              <View style={styles.searchWrapper}>
                <Ionicons name="search-outline" size={16} color="#94a3b8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search expenses..."
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Category filter pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <TouchableOpacity
                style={[
                  styles.filterPill,
                  filterCategory === null && styles.filterPillActive,
                ]}
                onPress={() => setFilterCategory(null)}
              >
                <Text
                  style={
                    filterCategory === null
                      ? styles.filterPillTextActive
                      : styles.filterPillText
                  }
                >
                  All
                </Text>
              </TouchableOpacity>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.filterPill,
                    filterCategory === cat && styles.filterPillActive,
                  ]}
                  onPress={() =>
                    setFilterCategory(filterCategory === cat ? null : cat)
                  }
                >
                  <Text
                    style={
                      filterCategory === cat
                        ? styles.filterPillTextActive
                        : styles.filterPillText
                    }
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.listTitle}>
              Transaction History
              {filteredExpenses.length !== expenses.length &&
                ` (${filteredExpenses.length} of ${expenses.length})`}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.expenseItem}>
            <View
              style={[
                styles.categoryDot,
                {
                  backgroundColor: CATEGORY_COLORS[item.category] || "#64748b",
                },
              ]}
            />
            <View style={styles.expenseInfo}>
              <Text style={styles.expenseDesc}>{item.description}</Text>
              <View
                style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
              >
                <Text style={styles.expenseCategory}>
                  {item.category || "✨ Other"}
                </Text>
                <Text style={styles.expenseDate}>
                  {formatDate(item.createdAt)}
                </Text>
              </View>
            </View>
            <View style={styles.rightSide}>
              <Text style={styles.expenseAmount}>
                -₱{item.amount.toFixed(2)}
              </Text>
              <TouchableOpacity
                onPress={() => handleDeleteExpense(item.id)}
                style={styles.deleteBtn}
              >
                <MaterialIcons
                  name="delete-outline"
                  size={22}
                  color="#ef4444"
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={52} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {searchQuery || filterCategory
                ? "No matching expenses"
                : "No expenses yet"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || filterCategory
                ? "Try a different search or filter."
                : "Add your first expense above to start tracking."}
            </Text>
          </View>
        }
      />

      {/* ── ANALYTICS MODAL ── */}
      <Modal
        animationType="slide"
        transparent
        visible={isAnalyticsModalVisible}
        onRequestClose={() => setIsAnalyticsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { maxWidth: SCREEN_WIDTH - 40, width: "100%" },
            ]}
          >
            <View style={styles.modalTitleRow}>
              <Text style={styles.modalTitle}>Spending Analytics</Text>
              <TouchableOpacity
                onPress={() => setIsAnalyticsModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={styles.analyticsStatRow}>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatNum}>
                  ₱{totalSpent.toFixed(2)}
                </Text>
                <Text style={styles.analyticsStatLabel}>Total Spent</Text>
              </View>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatNum}>{expenses.length}</Text>
                <Text style={styles.analyticsStatLabel}>Transactions</Text>
              </View>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatNum}>
                  ₱
                  {expenses.length > 0
                    ? (totalSpent / expenses.length).toFixed(0)
                    : "0"}
                </Text>
                <Text style={styles.analyticsStatLabel}>Avg per Entry</Text>
              </View>
            </View>

            <Text
              style={[styles.insightsTitle, { marginBottom: 10, marginTop: 4 }]}
            >
              By Category
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              {Object.keys(categoryTotals).length === 0 ? (
                <Text
                  style={{
                    color: "#94a3b8",
                    textAlign: "center",
                    paddingVertical: 20,
                  }}
                >
                  No expenses to analyze yet.
                </Text>
              ) : (
                Object.entries(categoryTotals)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, total]) => {
                    const pct = totalSpent > 0 ? (total / totalSpent) * 100 : 0;
                    const color = CATEGORY_COLORS[cat] || "#64748b";
                    return (
                      <View key={cat} style={{ marginBottom: 14 }}>
                        <View style={styles.breakdownLabelRow}>
                          <Text style={styles.breakdownCat}>{cat}</Text>
                          <Text style={[styles.breakdownAmt, { fontSize: 14 }]}>
                            ₱{total.toFixed(2)} ({pct.toFixed(1)}%)
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.progressTrack,
                            { height: 10, borderRadius: 5 },
                          ]}
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${pct}%` as any,
                                backgroundColor: color,
                                borderRadius: 5,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.btnModalClose, { marginTop: 16 }]}
              onPress={() => setIsAnalyticsModalVisible(false)}
            >
              <Text style={styles.btnModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── SESSION TIMEOUT MODAL ── */}
      <Modal
        animationType="fade"
        transparent
        visible={showSessionModal}
        onRequestClose={() => {}} // User must make a selection manually
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingVertical: 32 }]}>
            <View
              style={[
                styles.iconCircle,
                {
                  marginBottom: 16,
                  width: 64,
                  height: 64,
                  backgroundColor: "#f0f9ff",
                },
              ]}
            >
              <Ionicons name="time-outline" size={36} color="#0284c7" />
            </View>
            <Text style={styles.modalTitle}>Stay Logged In</Text>
            <Text
              style={[styles.modalSubtitle, { marginBottom: 24, fontSize: 13 }]}
            >
              How long would you like to keep this session active?
            </Text>

            <TouchableOpacity
              style={[styles.loginButton, { marginTop: 0, marginBottom: 8 }]}
              onPress={() => handleSetSession(10 * 60 * 1000)} // 10 mins
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>10 Minutes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, { marginTop: 0, marginBottom: 8 }]}
              onPress={() => handleSetSession(24 * 60 * 60 * 1000)} // 1 day
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>1 Day</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, { marginTop: 0, marginBottom: 8 }]}
              onPress={() => handleSetSession(7 * 24 * 60 * 60 * 1000)} // 7 days
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>7 Days</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.loginButton,
                { marginTop: 4, marginBottom: 0, backgroundColor: "#16a34a" },
              ]}
              onPress={() => handleSetSession(null)} // Forever
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Keep me logged in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── TOAST ── */}
      <Toast
        key={toastKey.current}
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
      />
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // AUTH
  authContainer: { flex: 1, backgroundColor: "#f8fafc" },
  scrollAuthContainer: { flexGrow: 1, justifyContent: "center", padding: 24 },
  authCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 28,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    alignItems: "center",
    position: "relative",
    width: "100%",
  },
  backButton: {
    position: "absolute",
    top: 20,
    left: 20,
    padding: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    zIndex: 10,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f0f9ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 4,
  },
  brandCreditsText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
    marginBottom: 16,
    textAlign: "center",
  },
  authSubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 10,
    lineHeight: 20,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
    width: "100%",
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  authInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: "#0f172a" },
  eyeIconBtn: { padding: 6 },
  forgotBtn: { alignSelf: "flex-end", marginBottom: 20, marginRight: 4 },
  forgotText: { color: "#0284c7", fontSize: 13, fontWeight: "600" },
  loginButton: {
    backgroundColor: "#0284c7",
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    marginTop: 8,
  },
  signUpButton: { marginTop: 20, padding: 10 },
  signUpText: { color: "#64748b", fontSize: 14, fontWeight: "600" },

  // MODALS
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8,
  },
  modalTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#0f172a" },
  modalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  boldEmail: { color: "#0f172a", fontWeight: "600" },
  btnModalClose: {
    backgroundColor: "#0284c7",
    width: "100%",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  btnModalCloseText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },

  // ANALYTICS MODAL
  analyticsStatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 16,
  },
  analyticsStatBox: { alignItems: "center", flex: 1 },
  analyticsStatNum: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  analyticsStatLabel: { fontSize: 11, color: "#94a3b8", marginTop: 2 },

  // DRAWER
  drawerOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    zIndex: 999,
  },
  drawerContainer: {
    width: SCREEN_WIDTH * 0.82,
    backgroundColor: "#ffffff",
    height: "100%",
    paddingHorizontal: 22,
    paddingTop: 56,
  },
  drawerHeader: {
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingBottom: 18,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#0284c7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  avatarInitial: { fontSize: 22, fontWeight: "800", color: "#fff" },
  drawerDisplayName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  drawerEmail: { fontSize: 13, color: "#64748b", marginTop: 2, width: "100%" },
  userBadge: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  userBadgeText: { color: "#0369a1", fontSize: 11, fontWeight: "600" },

  // DRAWER TABS
  drawerTabRow: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  drawerTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  drawerTabActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  drawerTabText: { fontSize: 13, fontWeight: "600", color: "#94a3b8" },
  drawerTabTextActive: { color: "#0284c7" },

  // INSIGHTS TAB
  quickStatsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  quickStatCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  quickStatValue: { fontSize: 18, fontWeight: "800", color: "#0284c7" },
  quickStatLabel: { fontSize: 11, color: "#64748b", marginTop: 2 },
  insightsSection: { marginBottom: 20 },
  insightsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  insightCard: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  insightTextWrapper: { flex: 1 },
  insightLabel: { fontSize: 11, color: "#64748b", fontWeight: "500" },
  insightValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "700",
    marginTop: 2,
  },
  insightValueBody: {
    fontSize: 12,
    color: "#334155",
    marginTop: 2,
    lineHeight: 16,
  },

  // BREAKDOWN
  breakdownSection: { marginBottom: 12 },
  breakdownRow: { marginBottom: 10 },
  breakdownLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  breakdownCat: { fontSize: 12, color: "#334155", fontWeight: "600" },
  breakdownAmt: { fontSize: 12, color: "#64748b" },
  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  breakdownPct: { fontSize: 10, color: "#94a3b8", marginTop: 2 },

  // ACCOUNT TAB
  accountSection: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  accountSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  accountInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountInfoValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "600",
    flex: 1,
  },
  editNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  editNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#0284c7",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
  saveNameBtn: {
    backgroundColor: "#0284c7",
    borderRadius: 8,
    padding: 8,
  },
  cancelNameBtn: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    padding: 8,
  },
  accountStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  accountStatBox: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  accountStatNum: { fontSize: 18, fontWeight: "800", color: "#0284c7" },
  accountStatLabel: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 2,
    textAlign: "center",
  },

  drawerLogoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#fee2e2",
    borderRadius: 12,
    gap: 10,
    marginBottom: 10,
    marginTop: 10,
  },
  drawerLogoutText: { fontSize: 14, fontWeight: "700", color: "#ef4444" },

  // DASHBOARD
  container: { flex: 1, backgroundColor: "#f8fafc", paddingHorizontal: 20 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    paddingTop: 50,
  },
  menuIconBtn: { padding: 4 },
  navBarTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 24,
    borderRadius: 24,
    marginBottom: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 14,
    color: "#64748b",
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalAmount: { fontSize: 38, fontWeight: "800", color: "#0f172a" },
  badge: {
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 8,
  },
  usdAmount: { fontSize: 13, color: "#475569", fontWeight: "500" },
  inputContainer: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 24,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#f8fafc",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
    marginBottom: 14,
    color: "#0f172a",
  },
  categoryLabel: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 10,
    fontWeight: "600",
  },
  chipContainer: { flexDirection: "row", marginBottom: 20 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  activeChip: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  inactiveChip: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" },
  activeChipText: { color: "#ffffff", fontWeight: "600", fontSize: 13 },
  inactiveChipText: { color: "#64748b", fontWeight: "500", fontSize: 13 },
  button: {
    backgroundColor: "#0284c7",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },

  // SEARCH + FILTER
  searchFilterRow: { marginBottom: 10 },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#0f172a" },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  filterPillActive: { backgroundColor: "#0284c7", borderColor: "#0284c7" },
  filterPillText: { fontSize: 12, color: "#64748b", fontWeight: "500" },
  filterPillTextActive: { fontSize: 12, color: "#fff", fontWeight: "600" },

  // LIST
  listTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 12,
  },
  expenseItem: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    gap: 12,
  },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  expenseInfo: { flex: 1 },
  expenseDesc: { fontSize: 15, color: "#0f172a", fontWeight: "600" },
  expenseCategory: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    fontWeight: "500",
  },
  expenseDate: { fontSize: 11, color: "#94a3b8", fontWeight: "400" },
  rightSide: { flexDirection: "row", alignItems: "center", gap: 12 },
  expenseAmount: { fontSize: 15, color: "#ef4444", fontWeight: "700" },
  deleteBtn: { padding: 4, backgroundColor: "#fef2f2", borderRadius: 8 },

  // EMPTY STATE
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#475569",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#94a3b8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
});
