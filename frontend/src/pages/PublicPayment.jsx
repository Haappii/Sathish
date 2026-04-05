import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import QRCode from "qrcode";

const API = import.meta.env.VITE_API_URL || "";

const STEPS = { LOADING: "loading", FORM: "form", SUCCESS: "success", ERROR: "error" };

function buildUpiString(upiId, shopName, amount) {
  let str = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName || "")}&cu=INR`;
  if (amount && parseFloat(amount) > 0) {
    str += `&am=${parseFloat(amount).toFixed(2)}`;
  }
  str += `&tn=${encodeURIComponent("Table Reservation Advance")}`;
  return str;
}

export default function PublicPayment() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [step, setStep] = useState(STEPS.LOADING);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMsg("Invalid payment link. Please use the link sent to your email.");
      setStep(STEPS.ERROR);
      return;
    }
    axios
      .get(`${API}/api/public/reservations/pay/${token}`)
      .then((r) => {
        setInfo(r.data);
        if (r.data.payment_status === "PAID") {
          setStep(STEPS.SUCCESS);
        } else {
          setStep(STEPS.FORM);
        }
      })
      .catch((e) => {
        setErrorMsg(
          e?.response?.status === 404
            ? "This payment link is invalid or has expired."
            : "Something went wrong. Please try again."
        );
        setStep(STEPS.ERROR);
      });
  }, [token]);

  // Generate UPI QR once info is loaded
  useEffect(() => {
    if (!info?.upi_id || step !== STEPS.FORM) return;
    const upiStr = buildUpiString(info.upi_id, info.shop_name, info.advance_amount);
    QRCode.toDataURL(upiStr, { width: 240, margin: 2, color: { dark: "#1e293b", light: "#ffffff" } })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(""));
  }, [info, step]);

  const confirmPayment = async () => {
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/public/reservations/pay/${token}`);
      setStep(STEPS.SUCCESS);
    } catch (e) {
      setErrorMsg(e?.response?.data?.detail || "Failed to confirm payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────
  if (step === STEPS.LOADING) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500">Loading payment details...</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────
  if (step === STEPS.ERROR) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">❌</div>
          <h1 className="text-lg font-bold text-gray-800">Link Not Found</h1>
          <p className="text-sm text-gray-500">{errorMsg}</p>
          {info?.shop_mobile && (
            <p className="text-[12px] text-gray-400">
              Contact us: <span className="font-semibold text-gray-700">{info.shop_mobile}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────
  if (step === STEPS.SUCCESS) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-3xl">✓</div>
          <div>
            <h1 className="text-lg font-bold text-gray-800">Payment Received!</h1>
            <p className="text-sm text-gray-500 mt-1">
              Thank you, <span className="font-semibold text-gray-700">{info?.customer_name}</span>!
              Your payment has been noted.
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 text-[13px]">
            <div className="flex justify-between">
              <span className="text-gray-500">Restaurant</span>
              <span className="font-semibold text-gray-800">{info?.shop_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-semibold text-gray-800">{info?.reservation_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Time</span>
              <span className="font-semibold text-gray-800">{info?.reservation_time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Guests</span>
              <span className="font-semibold text-gray-800">{info?.guests}</span>
            </div>
            {info?.advance_amount > 0 && (
              <div className="flex justify-between border-t pt-2 mt-1">
                <span className="text-gray-500">Amount Paid</span>
                <span className="font-bold text-emerald-700">₹{parseFloat(info.advance_amount).toFixed(2)}</span>
              </div>
            )}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[12px] text-amber-700">
            The restaurant will verify your payment and confirm your booking shortly.
          </div>
          {info?.shop_mobile && (
            <p className="text-[11px] text-gray-400">
              Questions? Call <span className="font-semibold text-gray-700">{info.shop_mobile}</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Payment Form ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-start justify-center p-4 py-10">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center mx-auto mb-3 text-2xl">💳</div>
          <h1 className="text-xl font-bold text-gray-900">{info?.shop_name || "Table Reservation"}</h1>
          <p className="text-[12px] text-blue-600 font-medium mt-1">Complete Your Payment</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-5">
          {/* Booking Summary */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Booking Summary</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="font-semibold text-gray-800">{info?.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="font-semibold text-gray-800">{info?.reservation_date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Time</span>
                <span className="font-semibold text-gray-800">{info?.reservation_time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Guests</span>
                <span className="font-semibold text-gray-800">{info?.guests}</span>
              </div>
              {info?.advance_amount > 0 && (
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-gray-500 font-semibold">Advance to Pay</span>
                  <span className="font-bold text-blue-700 text-[15px]">₹{parseFloat(info.advance_amount).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* UPI QR Code */}
          {info?.upi_id && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Scan & Pay via UPI</p>
              <div className="flex flex-col items-center gap-3">
                {qrDataUrl ? (
                  <div className="p-3 bg-white border-2 border-gray-100 rounded-2xl shadow-sm">
                    <img src={qrDataUrl} alt="UPI QR Code" className="w-48 h-48" />
                  </div>
                ) : (
                  <div className="w-48 h-48 bg-gray-100 rounded-2xl flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div className="text-center space-y-1">
                  <p className="text-[12px] text-gray-500">Scan with any UPI app</p>
                  <div className="flex items-center gap-2 justify-center flex-wrap text-[11px] text-gray-400">
                    <span>GPay</span><span>•</span><span>PhonePe</span><span>•</span>
                    <span>Paytm</span><span>•</span><span>BHIM</span>
                  </div>
                  <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 inline-flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">UPI ID:</span>
                    <span className="text-[12px] font-bold text-gray-800 select-all">{info.upi_id}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-[12px] text-rose-700">
              {errorMsg}
            </div>
          )}

          {/* Confirm Button */}
          <button
            onClick={confirmPayment}
            disabled={submitting}
            className="w-full py-3 rounded-xl text-[14px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-60 shadow-sm"
          >
            {submitting ? "Confirming..." : "I Have Made the Payment"}
          </button>

          <p className="text-center text-[11px] text-gray-400">
            After paying, tap the button above to notify the restaurant. Your booking will be confirmed after verification.
          </p>
        </div>

        {info?.shop_mobile && (
          <p className="text-center text-[11px] text-gray-500 mt-4">
            Need help? Call <span className="font-semibold text-gray-700">{info.shop_mobile}</span>
          </p>
        )}
      </div>
    </div>
  );
}
