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
import HeldInvoicesScreen   from "../screens/HeldInvoicesScreen";
import NativeModuleScreen from "../screens/NativeModuleScreen";
import InventoryScreen          from "../screens/InventoryScreen";
import DuesScreen               from "../screens/DuesScreen";
import ReturnsScreen            from "../screens/ReturnsScreen";
import EmployeesScreen          from "../screens/EmployeesScreen";
import EmployeeAttendanceScreen from "../screens/EmployeeAttendanceScreen";
import DayCloseScreen           from "../screens/DayCloseScreen";
import ReportsScreen            from "../screens/ReportsScreen";
import LoyaltyScreen            from "../screens/LoyaltyScreen";
import OnlineOrdersScreen       from "../screens/OnlineOrdersScreen";
import AnalyticsScreen          from "../screens/AnalyticsScreen";
import SupplierLedgerScreen     from "../screens/SupplierLedgerScreen";
import AdvanceOrdersScreen      from "../screens/AdvanceOrdersScreen";
import SettingsScreen           from "../screens/SettingsScreen";

const Stack = createNativeStackNavigator();

function Loader() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f6ff" }}>
      <ActivityIndicator size="large" color="#0b57d0" />
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
        animation: "slide_from_right",
        headerTitleStyle: { fontWeight: "800", color: "#0b1220" },
        headerTintColor: "#0b57d0",
        contentStyle:     { backgroundColor: "#f3f6ff" },
        headerStyle:      { backgroundColor: "#ffffff" },
        headerShadowVisible: false,
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
          <Stack.Screen
            name="HeldInvoices"
            component={HeldInvoicesScreen}
            options={{ title: "Held Invoices" }}
          />
            {/* ── New general screens ───────────────────────────────── */}
            <Stack.Screen
              name="Inventory"
              component={InventoryScreen}
              options={{ title: "Inventory" }}
            />
            <Stack.Screen
              name="Dues"
              component={DuesScreen}
              options={{ title: "Dues & Receivables" }}
            />
            <Stack.Screen
              name="Returns"
              component={ReturnsScreen}
              options={{ title: "Returns" }}
            />
            <Stack.Screen
              name="Employees"
              component={EmployeesScreen}
              options={{ title: "Employees" }}
            />
            <Stack.Screen
              name="EmployeeAttendance"
              component={EmployeeAttendanceScreen}
              options={{ title: "Attendance" }}
            />
            <Stack.Screen
              name="DayClose"
              component={DayCloseScreen}
              options={{ title: "Day Close" }}
            />
            <Stack.Screen
              name="Reports"
              component={ReportsScreen}
              options={{ title: "Reports" }}
            />
            <Stack.Screen
              name="Loyalty"
              component={LoyaltyScreen}
              options={{ title: "Loyalty" }}
            />
            <Stack.Screen
              name="OnlineOrders"
              component={OnlineOrdersScreen}
              options={{ title: "Online Orders" }}
            />
            <Stack.Screen
              name="Analytics"
              component={AnalyticsScreen}
              options={{ title: "Analytics" }}
            />
            <Stack.Screen
              name="SupplierLedger"
              component={SupplierLedgerScreen}
              options={{ title: "Supplier Ledger" }}
            />
            <Stack.Screen
              name="AdvanceOrders"
              component={AdvanceOrdersScreen}
              options={{ title: "Advance Orders" }}
            />
            <Stack.Screen
              name="NativeModule"
              component={NativeModuleScreen}
              options={({ route }) => ({ title: route?.params?.title || "Module" })}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: "Settings" }}
            />
        </>
      )}
    </Stack.Navigator>
  );
}
