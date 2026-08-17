import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { safeFormat } from "./date-utils";

export async function generateReceipt(booking: any, user: any, station: any) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Calculations
  const totalPrice = booking.totalPrice || 0;
  const baseAmount = totalPrice / 1.18;
  const gstAmount = totalPrice - baseAmount;
  const kwh = booking.energyDeliveredKwh || 0;
  const ratePerKwh = booking.pricePerKwh || 8;
  const invoiceNo = `RCP-${user.uid.slice(0, 4).toUpperCase()}-${Date.now()}`;
  const invoiceDate = safeFormat(booking.endedAt || Date.now(), "PPpp");

  // Colors & Fonts
  doc.setTextColor(15, 76, 53); // SeniorDevOps Green
  doc.setFont("helvetica", "bold");
  
  // Header
  doc.setFontSize(22);
  doc.text("SeniorDevOps EV Charging", 15, 25);
  
  doc.setTextColor(100);
  doc.setFontSize(10);
  doc.text("TAX INVOICE", 15, 32);

  // Line
  doc.setDrawColor(200);
  doc.line(15, 38, pageWidth - 15, 38);

  // Invoice Info
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Invoice Details", 15, 50);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice No: ${invoiceNo}`, 15, 56);
  doc.text(`Date: ${invoiceDate}`, 15, 62);

  // Customer Info
  doc.setFont("helvetica", "bold");
  doc.text("Bill To", 15, 75);
  doc.setFont("helvetica", "normal");
  doc.text(`${user.displayName || "Valued Customer"}`, 15, 81);
  doc.text(`${user.email || ""}`, 15, 87);
  doc.text(`${user.phoneNumber || ""}`, 15, 93);

  // Station Info
  doc.setFont("helvetica", "bold");
  doc.text("Charging Station", pageWidth / 2, 75);
  doc.setFont("helvetica", "normal");
  doc.text(`${station?.name || booking.stationName}`, pageWidth / 2, 81);
  doc.text(`${station?.address || "Address not provided"}`, pageWidth / 2, 87, { maxWidth: pageWidth / 2 - 15 });
  if (station?.gstNumber) {
    doc.text(`GSTIN: ${station.gstNumber}`, pageWidth / 2, 99);
  }

  // Session Details Table Header
  const tableTop = 115;
  doc.setFillColor(245, 245, 245);
  doc.rect(15, tableTop, pageWidth - 30, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Description", 20, tableTop + 7);
  doc.text("Qty", 100, tableTop + 7);
  doc.text("Rate", 130, tableTop + 7);
  doc.text("Amount", 170, tableTop + 7);

  // Table Body
  doc.setFont("helvetica", "normal");
  let currentY = tableTop + 18;
  
  // Row 1: Energy
  doc.text(`Charging Session (${booking.connectorType || "CCS2"})`, 20, currentY);
  doc.text(`${kwh.toFixed(2)} kWh`, 100, currentY);
  doc.text(`₹${ratePerKwh.toFixed(2)}`, 130, currentY);
  doc.text(`₹${(kwh * ratePerKwh).toFixed(2)}`, 170, currentY);

  currentY += 10;
  
  // Calculations Line
  doc.line(120, currentY, pageWidth - 15, currentY);
  currentY += 8;

  // Totals
  doc.text("Base Amount:", 130, currentY);
  doc.text(`₹${baseAmount.toFixed(2)}`, 170, currentY);
  
  currentY += 7;
  doc.text("GST (18%):", 130, currentY);
  doc.text(`₹${gstAmount.toFixed(2)}`, 170, currentY);
  
  currentY += 8;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 76, 53);
  doc.text("Total Amount:", 130, currentY);
  doc.text(`₹${totalPrice.toFixed(2)}`, 170, currentY);

  // Impact Section
  currentY += 20;
  doc.setFillColor(232, 245, 233);
  doc.roundedRect(15, currentY, pageWidth - 30, 20, 3, 3, "F");
  doc.setTextColor(46, 125, 50);
  doc.setFontSize(10);
  const co2 = (kwh * 0.82).toFixed(2);
  doc.text(`Environmental Impact: You saved ${co2} kg of CO2 during this session! 🌱`, 20, currentY + 12);

  // QR Code
  try {
    const qrDataUrl = await QRCode.toDataURL(booking.id);
    doc.addImage(qrDataUrl, "PNG", 15, currentY + 30, 30, 30);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("Scan to verify booking", 15, currentY + 65);
  } catch (err) {
    console.error("QR Code generation failed", err);
  }

  // Footer
  doc.setFontSize(10);
  doc.setTextColor(150);
  doc.setFont("helvetica", "italic");
  doc.text("Thank you for choosing clean energy.", pageWidth / 2, 280, { align: "center" });
  doc.text("This is a computer-generated invoice.", pageWidth / 2, 285, { align: "center" });

  return doc.output("blob");
}
