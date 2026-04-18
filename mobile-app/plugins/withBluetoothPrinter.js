// Config plugin: adds a custom BluetoothPrinterModule (Android) for silent ESC/POS printing
// via standard Android Bluetooth SPP — works with any paired Bluetooth thermal printer.
const { withMainApplication, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const BLUETOOTH_MODULE_KT = `package com.haappii.billing

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothSocket
import com.facebook.react.bridge.*
import java.io.OutputStream
import java.util.UUID

private val SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

class BluetoothPrinterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BluetoothPrinterModule"

    private fun connectSocket(address: String): Pair<BluetoothSocket, OutputStream> {
        val adapter = BluetoothAdapter.getDefaultAdapter()
            ?: throw Exception("BT_UNAVAILABLE: Bluetooth not available on this device")
        val cleanAddress = address.removePrefix("BT:").removePrefix("bt:").trim().uppercase()
        val device = try {
            adapter.getRemoteDevice(cleanAddress)
        } catch (e: IllegalArgumentException) {
            throw Exception("INVALID_ADDRESS: Invalid Bluetooth address: $cleanAddress")
        }
        adapter.cancelDiscovery()
        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        socket.connect()
        return Pair(socket, socket.outputStream)
    }

    private fun writeQRCode(out: OutputStream, data: String) {
        val qrBytes = data.toByteArray(Charsets.UTF_8)
        val totalLen = qrBytes.size + 3
        val pL = (totalLen and 0xFF).toByte()
        val pH = ((totalLen shr 8) and 0xFF).toByte()
        out.write(byteArrayOf(0x0A))                                                          // line feed before QR
        out.write(byteArrayOf(0x1B, 0x61, 0x01))                                             // center align
        out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00))       // model 2
        out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x42, 0x05))             // size 5
        out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x31))             // error correction M
        out.write(byteArrayOf(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30))                 // store data
        out.write(qrBytes)
        out.write(byteArrayOf(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30))             // print QR
        out.write(byteArrayOf(0x0A, 0x0A))                                                    // feed after QR
        out.write(byteArrayOf(0x1B, 0x61, 0x00))                                             // left align
    }

    @ReactMethod
    fun printText(address: String, text: String, promise: Promise) {
        Thread {
            var socket: BluetoothSocket? = null
            try {
                val (sock, out) = connectSocket(address)
                socket = sock
                out.write(byteArrayOf(0x1B, 0x40))
                out.write(text.toByteArray(Charsets.UTF_8))
                out.write(byteArrayOf(0x1B, 0x64, 0x04))
                out.write(byteArrayOf(0x1D, 0x56, 0x41, 0x10))
                out.flush()
                Thread.sleep(800)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("PRINT_FAILED", e.message ?: "Bluetooth print failed")
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }.start()
    }

    @ReactMethod
    fun printTextWithQR(address: String, text: String, qrData: String, promise: Promise) {
        Thread {
            var socket: BluetoothSocket? = null
            try {
                val (sock, out) = connectSocket(address)
                socket = sock
                out.write(byteArrayOf(0x1B, 0x40))
                out.write(text.toByteArray(Charsets.UTF_8))
                if (qrData.isNotBlank()) {
                    writeQRCode(out, qrData)
                }
                out.write(byteArrayOf(0x1B, 0x64, 0x04))
                out.write(byteArrayOf(0x1D, 0x56, 0x41, 0x10))
                out.flush()
                Thread.sleep(1000)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("PRINT_FAILED", e.message ?: "Bluetooth print failed")
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }.start()
    }
}
`;

const BLUETOOTH_PACKAGE_KT = `package com.haappii.billing

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class BluetoothPrinterPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(BluetoothPrinterModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`;

function withBluetoothPrinterFiles(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const packageDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "haappii",
        "billing"
      );
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "BluetoothPrinterModule.kt"),
        BLUETOOTH_MODULE_KT
      );
      fs.writeFileSync(
        path.join(packageDir, "BluetoothPrinterPackage.kt"),
        BLUETOOTH_PACKAGE_KT
      );
      return config;
    },
  ]);
}

function withBluetoothPrinterMainApp(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes("BluetoothPrinterPackage")) {
      return config;
    }

    // Replace the default getPackages to add our package
    contents = contents.replace(
      /override fun getPackages\(\): List<ReactPackage> \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*return PackageList\(this\)\.packages\s*\}/,
      `override fun getPackages(): List<ReactPackage> {
            val packages = PackageList(this).packages
            packages.add(BluetoothPrinterPackage())
            return packages
          }`
    );

    // Fallback pattern if comment style differs
    if (!contents.includes("BluetoothPrinterPackage")) {
      contents = contents.replace(
        "return PackageList(this).packages",
        `val packages = PackageList(this).packages\n            packages.add(BluetoothPrinterPackage())\n            return packages`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withBluetoothPrinter(config) {
  config = withBluetoothPrinterFiles(config);
  config = withBluetoothPrinterMainApp(config);
  return config;
};
