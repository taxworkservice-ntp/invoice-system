/**
 * Generate a polished HTML string for a document based on the "Apple-style" template.
 */
export function generateDocumentHTML(document, companyInfo, documentType = 'invoice') {
  // Extract customer info with robust fallbacks
  const customer = document.customer || document.customers || document.sales_order?.customer || {};
  const customerName = customer?.name || document.customer_name || document.customer?.name || document.customers?.name || document.sales_order?.customer_name || 'Customer Name';
  const customerAddress = {
    l1: customer?.address_1 || customer?.address || customer?.billing_address || document.delivery_address || document.address || '',
    l2: customer?.address_2 || '',
    l3: customer?.address_3 || ''
  };
  const customerPhone = customer?.phone || document.customer_phone || '';
  const customerEmail = customer?.email || document.customer_email || '';

  const isInvoice = documentType === 'invoice';
  const isDeliveryNote = documentType === 'delivery' || documentType === 'delivery_note';
  const isSalesOrder = documentType === 'sales_order' || documentType === 'order';
  const isReceipt = documentType === 'receipt';
  const isCreditNote = documentType === 'credit_note';

  const documentTitle = isInvoice ? 'INVOICE' : isDeliveryNote ? 'DELIVERY NOTE' : isReceipt ? 'RECEIPT' : isCreditNote ? 'CREDIT NOTE' : 'SALES ORDER';
  const documentNumber = isInvoice ? document.invoice_number : isDeliveryNote ? (document.delivery_number || document.delivery_note_number) : isReceipt ? (document.payment_number || document.id) : isCreditNote ? document.credit_note_number : document.order_number;
  const documentDate = isInvoice ? document.invoice_date : isDeliveryNote ? document.delivery_date : isReceipt ? document.payment_date : isCreditNote ? document.credit_date : document.order_date;

  const items = document.items || document.credit_note_items || [];

  // Calculate totals if missing (for backward compatibility or list-view print)
  let subtotal = Number(document.subtotal || 0);
  let tax_amount = Number(document.tax_amount || 0);
  const credit_amount = Number(document.credit_amount || document.total_amount || document.amount || 0);

  const calculateLineItem = (item) => {
    // Priority for quantity: quantity_delivered (DN) > quantity (CN) > quantity_ordered (SO/INV)
    const qty = parseFloat(item.quantity_delivered || item.quantity || item.quantity_ordered || 0);
    const price = parseFloat(item.unit_price || item.price || 0);
    const discPercent = parseFloat(item.discount_percent || 0);
    const lineDiscount = qty * price * (discPercent / 100);
    const lineTotal = qty * price - lineDiscount;
    return { qty, lineDiscount, lineTotal };
  };

  if ((isCreditNote || isDeliveryNote) && subtotal <= 0 && items.length > 0) {
    subtotal = items.reduce((sum, item) => {
      const { lineTotal } = calculateLineItem(item);
      return sum + lineTotal;
    }, 0);
  }

  // Calculate global (invoice level) discount
  const globalDiscPercent = parseFloat(document.discount_percent || document.sales_order?.discount_percent || 0);
  const globalDiscAmount = parseFloat(document.discount_amount || (subtotal * (globalDiscPercent / 100)) || 0);
  const netAmount = subtotal - globalDiscAmount;

  // Recalculate tax if missing or specifically for DN/CN
  if (isDeliveryNote || isCreditNote || tax_amount <= 0) {
    const taxRate = (document.tax_percentage !== undefined ? document.tax_percentage : 7) / 100;
    tax_amount = companyInfo?.has_vat ? (netAmount * taxRate) : 0;
  }

  // Ensure finalTotal includes tax/VAT and account for global discount
  let finalTotal = credit_amount;
  if ((isDeliveryNote || isCreditNote) || (finalTotal <= 0)) {
    finalTotal = netAmount + tax_amount;
  } else if (companyInfo?.has_vat && finalTotal <= subtotal) {
    // If has_vat but total is suspiciously same as subtotal (old record), recalculate
    finalTotal = netAmount + tax_amount;
  }

  const typeColor = isInvoice ? '#003049' : isDeliveryNote ? '#34c759' : isReceipt ? '#0070c9' : isCreditNote ? '#dc2626' : '#ff3b30';

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatCurrency = (amount) => {
    const numAmount = Number(amount) || 0;
    return numAmount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${documentTitle} ${documentNumber || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { 
      size: A4; 
      margin: 15mm; /* Proper margins for printing */
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: white;
      color: #1d1d1f;
      font-size: 10pt;
      line-height: 1.5;
      /* Remove any default margins */
      margin: 0;
      padding: 0;
    }
    .indicator-line { width: 100%; height: 8px; background-color: ${typeColor}; }
    .container { 
      width: 100%; 
      max-width: 210mm; 
      margin: 0 auto; 
      padding: 10mm 15mm; 
      /* Remove fixed height to prevent blank pages */
      min-height: auto;
      /* Prevent content from spilling to next page */
      page-break-inside: avoid;
    }
    .header { display: flex; justify-content: space-between; padding-bottom: 20px; border-bottom: 1px solid #d2d2d7; margin-bottom: 30px; page-break-inside: avoid; }
    .company-name { font-size: 14pt; font-weight: 600; margin-bottom: 4px; }
    .company-details p { font-size: 8.5pt; color: #6e6e73; margin: 2px 0; }
    .doc-info { text-align: right; }
    .doc-info h1 { font-size: 24pt; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 4px; }
    .doc-info p { font-size: 10pt; color: #6e6e73; }
    .info-grid { display: flex; gap: 40px; margin-bottom: 30px; border-bottom: 1px solid #d2d2d7; padding-bottom: 20px; page-break-inside: avoid; }
    .info-block { flex: 1; }
    .info-block h3 { font-size: 8pt; font-weight: 600; color: #86868b; text-transform: uppercase; margin-bottom: 8px; }
    .primary-name { font-size: 10pt; font-weight: 600; margin-bottom: 4px; }
    .info-block p { font-size: 9pt; color: #1d1d1f; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; page-break-inside: auto; }
    th { font-size: 7.5pt; font-weight: 600; color: #86868b; text-transform: uppercase; text-align: left; padding: 6px 8px; border-bottom: 1px solid #d2d2d7; }
    td { padding: 6px 8px; font-size: 8.5pt; border-bottom: 1px solid #f5f5f7; vertical-align: top; }
    .right { text-align: right; }
    .center { text-align: center; }
    .totals-wrapper { display: flex; justify-content: flex-end; margin-top: 20px; page-break-inside: avoid; }
    .totals-table { width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 2px 0; }
    .final-total { border-top: 1px solid #d2d2d7; margin-top: 10px; padding-top: 10px; font-weight: 600; font-size: 11pt; }
    .footer { margin-top: 50px; text-align: center; font-size: 8.5pt; color: #86868b; page-break-inside: avoid; }
    .signature-section { margin-top: 80px; display: flex; justify-content: space-around; page-break-inside: avoid; }
    .sig-box { width: 200px; text-align: center; padding-top: 40px; border-top: 1px solid #d2d2d7; font-size: 8.5pt; }
    @media print { 
      .no-print { display: none !important; }
      /* Ensure content fits on one page when possible */
      body { margin: 0; }
      .container {
        /* Remove any padding that might cause overflow */
        padding: 0;
        /* Ensure container doesn't exceed page height */
        max-height: 277mm; /* A4 height minus 15mm margins */
        overflow: hidden;
      }
    }
    .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #0071e3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Print Document</button>
  <div class="indicator-line"></div>
  <div class="container">
    <div class="header">
      <div class="company-details">
        <div class="company-name">${companyInfo?.name || 'Company Name'}</div>
        ${companyInfo?.address_1 ? `<p>${companyInfo.address_1}</p>` : companyInfo?.address ? `<p>${companyInfo.address}</p>` : ''}
        ${companyInfo?.address_2 ? `<p>${companyInfo.address_2}</p>` : ''}
        ${companyInfo?.address_3 ? `<p>${companyInfo.address_3}</p>` : ''}
        ${companyInfo?.tax_id ? `<p>Tax ID: ${companyInfo.tax_id}</p>` : ''}
        ${companyInfo?.phone ? `<p>Tel: ${companyInfo.phone}</p>` : ''}
        ${companyInfo?.email ? `<p>Email: ${companyInfo.email}</p>` : ''}
      </div>
      <div class="doc-info">
        <h1>${documentTitle}</h1>
        ${isDeliveryNote ? '<p style="font-size: 10pt; color: #dc2626; font-weight: 600; margin-bottom: 4px;">NOT A TAX INVOICE</p>' : ''}
        <p>${documentNumber || ''}</p>
        <p style="font-size: 8.5pt; color: #86868b; margin-top: 2px; font-weight: 500;">Original copy</p>
      </div>
    </div>
    
    <div class="info-grid">
      <div class="info-block">
        <h3>${isReceipt ? 'Customer' : 'Bill To'}</h3>
        <div class="primary-name">${customerName}</div>
        ${customerAddress.l1 ? `<p>${customerAddress.l1}</p>` : ''}
        ${customerAddress.l2 ? `<p>${customerAddress.l2}</p>` : ''}
        ${customerAddress.l3 ? `<p>${customerAddress.l3}</p>` : ''}
        ${customerPhone ? `<p>${customerPhone}</p>` : ''}
        ${customerEmail ? `<p>${customerEmail}</p>` : ''}
        ${customer?.tax_id ? `<p>Tax ID: ${customer.tax_id}</p>` : ''}
      </div>
      <div class="info-block">
        <h3>${isReceipt ? 'Payment Details' : 'Document Details'}</h3>
        <p><strong>${documentTitle} #:</strong> ${documentNumber || ''}</p>
        <p><strong>Date:</strong> ${formatDate(documentDate)}</p>
        ${isCreditNote && (document.invoice_number || document.invoices?.invoice_number) ? `
          <p><strong>Refer document:</strong> ${document.invoice_number || document.invoices?.invoice_number}</p>
        ` : ''}
        ${!isSalesOrder && !isCreditNote && (document.sales_order_number || document.sales_order?.order_number) ? `
          <p><strong>Ref to:</strong> ${document.sales_order_number || document.sales_order?.order_number}</p>
        ` : ''}
        ${isInvoice ? `<p><strong>Due Date:</strong> ${formatDate(document.due_date)}</p>` : ''}
        ${isSalesOrder ? `<p><strong>Status:</strong> ${document.status?.toUpperCase()}</p>` : ''}
        ${isReceipt ? `
          <p><strong>Method:</strong> ${document.payment_method?.toUpperCase().replace('_', ' ')}</p>
          ${document.reference_number ? `<p><strong>Ref:</strong> ${document.reference_number}</p>` : ''}
          ${document.invoice_number ? `<p><strong>Invoice:</strong> ${document.invoice_number}</p>` : ''}
        ` : ''}
      </div>
    </div>

    ${isReceipt ? `
      <div style="margin-bottom: 30px;">
        <h3 style="font-size: 8pt; font-weight: 600; color: #86868b; text-transform: uppercase; margin-bottom: 8px;">Allocations</h3>
        ${document.allocations && document.allocations.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th class="right">Invoice Date</th>
                <th class="right">Invoice Total</th>
                <th class="right">Allocated Amount</th>
              </tr>
            </thead>
            <tbody>
              ${document.allocations.map(alloc => `
                <tr>
                  <td>${alloc.invoice_number}</td>
                  <td class="right">${formatDate(alloc.invoice_date)}</td>
                  <td class="right">${formatCurrency(alloc.invoice_total || alloc.total_amount)}</td>
                  <td class="right" style="font-weight: 600;">${formatCurrency(alloc.allocated_amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `<p style="font-size: 10pt; color: #6e6e73;">This payment has not yet been allocated to specific invoices.</p>`}
      </div>
    ` : `
      <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="center">Quantity</th>
          <th class="right">Unit Price</th>
          <th class="right">Discount</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
    const { qty, lineTotal } = calculateLineItem(item);
    const discPercent = parseFloat(item.discount_percent || 0);
    return `
            <tr>
              <td>
                <div style="font-weight: 600;">${item.product_name || item.products?.name || item.description || item.name || 'Item'}</div>
              </td>
              <td class="center">${qty}</td>
              <td class="right">${formatCurrency(item.unit_price || item.price)}</td>
              <td class="right">${discPercent > 0 ? `${discPercent}%` : '-'}</td>
              <td class="right">${formatCurrency(lineTotal)}</td>
            </tr>
          `;
  }).join('')}
      </tbody>
    </table>
    `}

    <div class="totals-wrapper">
      <div class="totals-table">
        ${!isReceipt ? `
          <div class="totals-row">
            <span>Subtotal</span>
            <span>${formatCurrency(subtotal)}</span>
          </div>
          ${(globalDiscAmount > 0) ? `
            <div class="totals-row" style="color: #d60000;">
              <span>Discount</span>
              <span>-${formatCurrency(globalDiscAmount)}</span>
            </div>
            <div class="totals-row" style="font-weight: 500; border-top: 1px dashed #e5e7eb; padding-top: 8px;">
              <span>Amount Before VAT</span>
              <span>${formatCurrency(netAmount)}</span>
            </div>
          ` : ''}
          ${(companyInfo?.has_vat && tax_amount > 0) ? `
            <div class="totals-row">
              <span>VAT (${document.tax_percentage || 7}%)</span>
              <span>${formatCurrency(tax_amount)}</span>
            </div>
          ` : ''}
        ` : ''}
        <div class="totals-row final-total">
          <span>${isReceipt ? 'Total Paid' : isCreditNote ? 'Total Credit' : 'Total'}</span>
          <span>${formatCurrency(finalTotal || credit_amount || document.credit_amount || document.total_amount || document.amount)}</span>
        </div>
        ${isReceipt ? `
          <div class="totals-row">
            <span>Allocated</span>
            <span>${formatCurrency(document.allocated_amount)}</span>
          </div>
          <div class="totals-row" style="color: ${document.unallocated_amount > 0 ? '#d60000' : '#1d1d1f'}">
            <span>Unallocated</span>
            <span>${formatCurrency(document.unallocated_amount)}</span>
          </div>
        ` : ''}
      </div>
    </div>

    ${document.notes ? `
      <div style="margin-top: 30px;">
        <h3 style="font-size: 8pt; font-weight: 600; color: #86868b; text-transform: uppercase; margin-bottom: 8px;">Notes</h3>
        <p style="font-size: 9pt; white-space: pre-wrap;">${document.notes}</p>
      </div>
    ` : ''}

    <div class="signature-section">
      <div class="sig-box">Authorized Signature</div>
      <div class="sig-box">Customer Signature</div>
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
    </div>
  </div>
</body>
</html>
  `;
}
