import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";

// Screens
import LoginScreen        from "../screens/LoginScreen";
import HomeScreen         from "../screens/HomeScreen";
import CreateBillScreen   from "../screens/CreateBillScreen";
import SalesHistoryScreen from "../screens/SalesHistoryScreen";
import DashboardScreen    from "../screens/DashboardScreen";
import CustomersScreen    from "../screens/CustomersScreen";
import ExpensesScreen     from "../screens/ExpensesScreen";
import CashDrawerScreen   from "../screens/CashDrawerScreen";
import TableGridScreen    from "../screens/TableGridScreen";
import TableOrderScreen   from "../screens/TableOrderScreen";
import OrderLiveScreen    from "../screens/OrderLiveScreen";
import KotManagementScreen from "../screens/KotManagementScreen";
import QrOrdersAcceptScreen from "../screens/QrOrdersAcceptScreen";

const Stack = createNativeStackNavigator();

function Loader() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function AppNavigator() {
  const { booting, isLoggedIn } = useAuth();

  if (booting) return <Loader />;

  return (
    <Stack.Navigator
      key={isLoggedIn ? "logged-in" : "logged-out"}
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        contentStyle:     { backgroundColor: "#f1f5f9" },
        headerStyle:      { backgroundColor: "#fff" },
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: "Haappii Billing", headerBackVisible: false }}
          />
          <Stack.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ title: "Dashboard" }}
          />
          <Stack.Screen
            name="CreateBill"
            component={CreateBillScreen}
            options={{ title: "Take Away Billing" }}
          />
          <Stack.Screen
            name="SalesHistory"
            component={SalesHistoryScreen}
            options={{ title: "Billing History" }}
          />
          <Stack.Screen
            name="Customers"
            component={CustomersScreen}
            options={{ title: "Customers" }}
          />
          <Stack.Screen
            name="Expenses"
            component={ExpensesScreen}
            options={{ title: "Expenses" }}
          />
          <Stack.Screen
            name="CashDrawer"
            component={CashDrawerScreen}
            options={{ title: "Cash Drawer" }}
          />
          {/* Hotel-only screens */}
          <Stack.Screen
            name="TableGrid"
            component={TableGridScreen}
            options={{ title: "Table Billing" }}
          />
          <Stack.Screen
            name="TableOrder"
            component={TableOrderScreen}
            options={{ title: "Table Order" }}
          />
          <Stack.Screen
            name="OrderLive"
            component={OrderLiveScreen}
            options={{ title: "Order Live" }}
          />
          <Stack.Screen
            name="KotManagement"
            component={KotManagementScreen}
            options={{ title: "KOT Management" }}
          />
          <Stack.Screen
            name="QrOrdersAccept"
            component={QrOrdersAcceptScreen}
            options={{ title: "QR order accept" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
