import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import authAxios from "../api/authAxios";

export default function EditBill() {
  const { invoiceNumber } = useParams();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [shop, setShop] = useState({});
  const [loading, setLoading] = useState(true);
  const [deleteReason, setDeleteReason] = useState("");

  /* ----------------------------------
     Load Invoice + Shop GST Settings
  ---------------------------------- */
  useEffect(() => {
    if (!invoiceNumber) {
      console.error("invoiceNumber missing");
      navigate("/sales-history");
      return;
    }

    const loadData = async () => {
      try {
        const invRes = await authAxios.get(
          `/invoice/by-number/${invoiceNumber}`
        );
        const shopRes = await authAxios.get("/shop/details");

        setInvoice(invRes.data);
        setItems(invRes.data.items || []);
        setShop(shopRes.data || {});
      } catch (err) {
        console.error(err);

        if (err?.response?.status === 401) {
          alert("Session expired. Please login again.");
          localStorage.removeItem("token");
          navigate("/");
          return;
        }

        alert("Invoice not found");
        navigate("/sales-history");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [invoiceNumber, navigate]);

  /* ----------------------------------
     GST Calculation
  ---------------------------------- */
  const calculateTotals = () => {
    let subTotal = 0;
    let taxTotal = 0;

    const gstPercent = Number(shop.gst_percent || 0);
    const gstMode = String(shop.gst_mode || "inclusive").toLowerCase();

    items.forEach(i => {
      const amount = Number(i.amount || 0);
      subTotal += amount;

      if (shop.gst_enabled) {
        if (gstMode === "inclusive") {
          const base = amount / (1 + gstPercent / 100);
          taxTotal += amount - base;
        } else {
          taxTotal += amount * (gstPercent / 100);
        }
      }
    });

    const isExclusive = !!shop.gst_enabled && gstMode === "exclusive";
    return {
      total: isExclusive ? subTotal + taxTotal : subTotal,
      tax: taxTotal
    };
  };

  /* ----------------------------------
     Update Quantity
  ---------------------------------- */
  const updateQty = (idx, qty) => {
    if (qty < 1) return;

    const clone = [...items];
    clone[idx] = {
      ...clone[idx],
      quantity: qty,
      amount: qty * clone[idx].price
    };

    setItems(clone);
  };

  /* ----------------------------------
     Save (Modify Invoice)
  ---------------------------------- */
  const saveInvoice = async () => {
    try {
      const totals = calculateTotals();

      await authAxios.put(`/invoice/${invoice.invoice_id}`, {
        customer_name: invoice.customer_name,
        mobile: invoice.mobile,
        items: items.map(i => ({
          item_id: i.item_id,
          quantity: i.quantity,
          amount: i.amount
        })),
        total_amount: totals.total,
        tax_amt: totals.tax
      });

      alert("Invoice updated successfully");
      navigate("/sales-history");
    } catch (err) {
      console.error(err);
      alert(err?.response?.data?.detail || "Update failed");
    }
  };

  /* ----------------------------------
     Delete Invoice
  ---------------------------------- */
  const deleteInvoice = async () => {
    if (!deleteReason.trim()) {
      alert("Delete reason required");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this invoice?"))
      return;

    try {
      await authAxios.delete(`/invoice/${invoice.invoice_id}`, {
        data: { delete_reason: deleteReason }
      });

      alert("Invoice deleted");
      navigate("/sales-history");
    } catch (err) {
      console.error(err);
      alert("Delete failed");
    }
  };

  /* ----------------------------------
     SAFE RENDER GUARDS
  ---------------------------------- */
  if (loading) return <p>Loading...</p>;
  if (!invoice) return <p>Invoice not found</p>;

  const totals = calculateTotals();

  return (
    <div className="page">
      <h2>Edit Invoice – {invoice.invoice_number}</h2>

      <table className="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan="4">No items</td>
            </tr>
          )}

          {items.map((i, idx) => (
            <tr key={idx}>
              <td>{i.item_name}</td>
              <td>{Number(i.price).toFixed(2)}</td>
              <td>
                <input
                  type="number"
                  min="1"
                  value={i.quantity}
                  onChange={e =>
                    updateQty(idx, Number(e.target.value))
                  }
                />
              </td>
              <td>{Number(i.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <p>Tax: ₹ {totals.tax.toFixed(2)}</p>
        <p>
          <b>Total: ₹ {totals.total.toFixed(2)}</b>
        </p>
      </div>

      <div className="actions">
        <button onClick={saveInvoice} className="btn-primary">
          Save Changes
        </button>
      </div>

      <hr />

      <h3>Delete Invoice</h3>
      <textarea
        placeholder="Reason for delete"
        value={deleteReason}
        onChange={e => setDeleteReason(e.target.value)}
      />

      <button onClick={deleteInvoice} className="btn-danger">
        Delete Invoice
      </button>
    </div>
  );
}
