import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import GlobalAlertProvider from "./src/components/GlobalAlertProvider";
import AppNavigator from "./src/navigation/AppNavigator";

function ThemedApp() {
  const { theme } = useTheme();
  return (
    <NavigationContainer theme={theme.navTheme}>
      <StatusBar style={theme.statusBar} />
      <AppNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <GlobalAlertProvider>
          <ThemedApp />
        </GlobalAlertProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
