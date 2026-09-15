import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../context/ToastContext.jsx';
import { purchaseOrderService } from '../services/purchase-order.service.js';
import { formatMoney, formatQuantity, formatDateOnly } from '../utils/format.js';
import Modal from './Modal.jsx';
import Spinner from './Spinner.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import ReceiveGoodsModal from './ReceiveGoodsModal.jsx';
import PurchaseOrderFormModal from './PurchaseOrderFormModal.jsx';

const STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  partially_received: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
};

const STATUS_TONES = {
  draft: 'default',
  sent: 'returned',
  partially_received: 'warning',
  received: 'completed',
  cancelled: 'cancelled',
};

export function PurchaseOrderStatusBadge({ status }) {
  const label = STATUS_LABELS[status] || status || '—';
  const tone = STATUS_TONES[status] || 'default';
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

function PurchaseOrderSheet({ po }) {
  return (
    <div className="po-order-sheet">
      <div className="po-sheet-head">
        <span className="po-sheet-title">PURCHASE ORDER</span>
        <span className="po-sheet-number">{po.po_number}</span>
      </div>
      <div className="po-sheet-meta">
        <span><strong>Supplier:</strong> {po.supplier_name || '—'}</span>
        <span><strong>Order date:</strong> {formatDateOnly(po.order_date)}</span>
        <span><strong>Expected delivery:</strong> {formatDateOnly(po.expected_delivery_date)}</span>
        <span><strong>Status:</strong> {STATUS_LABELS[po.status] || po.status}</span>
      </div>
      <table className="po-sheet-table">
        <thead>
          <tr>
            <th className="po-sheet-product">Product</th>
            <th className="num">Qty</th>
            <th className="num">Unit</th>
            <th className="num">Rate</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((item) => (
            <tr key={item.id}>
              <td className="po-sheet-product">
                <span>{item.product_name}</span>
                {item.product_code ? <span className="po-sheet-sub">{item.product_code}</span> : null}
              </td>
              <td className="num">{formatQuantity(item.ordered_quantity)}</td>
              <td className="num">{item.unit || '—'}</td>
              <td className="num">{formatMoney(item.expected_price)}</td>
              <td className="num">{formatMoney(Number(item.ordered_quantity) * Number(item.expected_price))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="po-sheet-total">
        <span>Total</span>
        <strong>
          {formatMoney(
            po.items.reduce((sum, item) => sum + Number(item.ordered_quantity) * Number(item.expected_price), 0)
          )}
        </strong>
      </div>
      {po.notes ? <div className="po-sheet-notes"><strong>Notes:</strong> {po.notes}</div> : null}
      <div className="po-sheet-sign">
        <span>Prepared by: {po.created_by_name || '—'}</span>
        <span>Received by: ____________</span>
        <span>Supplier acknowledgement: ____________</span>
      </div>
    </div>
  );
}

export default function PurchaseOrderDetailModal({ poId, onClose, onChange }) {
  const { showToast } = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const detailAsync = useAsync(
    () => (poId ? purchaseOrderService.getById(poId) : Promise.resolve(null)),
    [poId]
  );
  const detail = detailAsync.data;

  useEffect(() => {
    function onAfterPrint() {
      document.body.classList.remove('po-print-mode');
    }
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('po-print-mode');
    };
  }, []);

  function handlePrint() {
    document.body.classList.add('po-print-mode');
    window.print();
  }

  async function handleSend() {
    try {
      const updated = await purchaseOrderService.send(poId);
      showToast(`Purchase order ${updated.po_number} sent to supplier.`, 'success');
      detailAsync.refetch();
      onChange();
    } catch (err) {
      showToast(err?.message || 'Could not send the purchase order.', 'error');
    }
  }

  async function handleCancel() {
    try {
      const updated = await purchaseOrderService.cancel(poId);
      setConfirmCancel(false);
      showToast(`Purchase order ${updated.po_number} cancelled.`, 'success');
      detailAsync.refetch();
      onChange();
    } catch (err) {
      setConfirmCancel(false);
      showToast(err?.message || 'Could not cancel the purchase order.', 'error');
    }
  }

  const status = detail?.status;

  return (
    <Modal title={`Purchase Order ${detail?.po_number || ''}`.trim() || 'Purchase Order'} onClose={onClose} wide>
      {detailAsync.loading && !detail ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '32px 0' }}>
          <Spinner label="Loading purchase order…" />
        </div>
      ) : null}

      {detailAsync.error && !detail ? (
        <div className="form-alert" role="alert">
          {detailAsync.error.message || 'Could not load the purchase order.'}
        </div>
      ) : null}

      {detail ? (
        <div className="purchase-order-detail">
          <div className="summary-grid">
            <div className="summary-item">
              <span className="summary-label">PO number</span>
              <span className="summary-value">{detail.po_number}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Status</span>
              <span className="summary-value">
                <PurchaseOrderStatusBadge status={detail.status} />
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Supplier</span>
              <span className="summary-value">{detail.supplier_name || '—'}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Order date</span>
              <span className="summary-value">{formatDateOnly(detail.order_date)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Expected delivery</span>
              <span className="summary-value">{formatDateOnly(detail.expected_delivery_date)}</span>
            </div>
            {detail.created_by_name ? (
              <div className="summary-item">
                <span className="summary-label">Created by</span>
                <span className="summary-value">{detail.created_by_name}</span>
              </div>
            ) : null}
          </div>

          <div className="detail-card">
            <div className="card-heading">
              <h3 className="card-title">Order Items</h3>
              <span className="card-caption">{detail.items.length} item{detail.items.length === 1 ? '' : 's'}</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Ordered</th>
                    <th className="num">Received</th>
                    <th className="num">Damaged</th>
                    <th className="num">Outstanding</th>
                    <th className="num">Expected price</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="cell-main">{item.product_name}</span>
                        {item.product_code ? <span className="cell-sub">{item.product_code}</span> : null}
                      </td>
                      <td className="num">{formatQuantity(item.ordered_quantity)}</td>
                      <td className="num">{formatQuantity(item.received_quantity)}</td>
                      <td className="num">
                        {Number(item.damaged_quantity) > 0 ? (
                          <span className="money" style={{ color: 'var(--color-danger)' }}>{formatQuantity(item.damaged_quantity)}</span>
                        ) : (
                          formatQuantity(item.damaged_quantity)
                        )}
                      </td>
                      <td className="num">{formatQuantity(item.remaining_quantity)}</td>
                      <td className="num">{formatMoney(item.expected_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {detail.receipts.length > 0 ? (
            <div className="detail-card">
              <div className="card-heading">
                <h3 className="card-title">Receiving History</h3>
                <span className="card-caption">
                  {detail.receipts.length} receipt{detail.receipts.length === 1 ? '' : 's'} — recorded as purchases
                </span>
              </div>
              {detail.receipts.map((receipt) => (
                <div className="po-receipt" key={receipt.id}>
                  <div className="po-receipt-head">
                    <span className="cell-main">{receipt.receipt_number}</span>
                    <span>{formatDateOnly(receipt.receipt_date)}</span>
                    <span>{receipt.created_by_name ? `by ${receipt.created_by_name}` : ''}</span>
                    <span className="num po-receipt-total">{formatMoney(receipt.total_amount)}</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num">Received</th>
                        <th className="num">Unit price</th>
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.product_name}</td>
                          <td className="num">{formatQuantity(item.quantity)}</td>
                          <td className="num">{formatMoney(item.purchase_price)}</td>
                          <td className="num">{formatMoney(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <div className="detail-card">
              <h3 className="card-title">Receiving History</h3>
              <p className="invoice-none-text">No goods received yet.</p>
            </div>
          )}

          {detail.notes ? (
            <div className="detail-card">
              <h3 className="card-title">Notes</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
                {detail.notes}
              </p>
            </div>
          ) : null}

          <div className="detail-actions">
            {status === 'draft' ? (
              <>
                <button type="button" className="btn btn-primary" onClick={handleSend}>Send to Supplier</button>
                <button type="button" className="btn btn-outline" onClick={() => setEditOpen(true)}>Edit</button>
                <button type="button" className="btn btn-outline" onClick={handlePrint}>Print</button>
                <button type="button" className="btn btn-outline" onClick={() => setConfirmCancel(true)} style={{ color: 'var(--color-danger)' }}>
                  Cancel Order
                </button>
              </>
            ) : null}

            {status === 'sent' || status === 'partially_received' ? (
              <>
                <button type="button" className="btn btn-primary" onClick={() => setReceiveOpen(true)}>Receive Goods</button>
                <button type="button" className="btn btn-outline" onClick={handlePrint}>Print</button>
                <button type="button" className="btn btn-outline" onClick={() => setConfirmCancel(true)} style={{ color: 'var(--color-danger)' }}>
                  Cancel Order
                </button>
              </>
            ) : null}

            {status === 'received' || status === 'cancelled' ? (
              <button type="button" className="btn btn-outline" onClick={handlePrint}>Print</button>
            ) : null}
          </div>
        </div>
      ) : null}

      {receiveOpen && detail ? (
        <ReceiveGoodsModal
          po={detail}
          onClose={() => setReceiveOpen(false)}
          onReceived={() => {
            setReceiveOpen(false);
            showToast('Goods received — stock updated.', 'success');
            detailAsync.refetch();
            onChange();
          }}
        />
      ) : null}

      {editOpen && detail ? (
        <PurchaseOrderFormModal
          initial={detail}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setEditOpen(false);
            showToast(`Purchase order ${updated.po_number} updated.`, 'success');
            detailAsync.refetch();
            onChange();
          }}
        />
      ) : null}

      {confirmCancel ? (
        <ConfirmDialog
          title="Cancel Purchase Order"
          message={`This closes ${detail?.po_number} and stops further receiving. Already received goods and stock are NOT affected. Continue?`}
          confirmLabel="Cancel Order"
          confirmBusyLabel="Cancelling…"
          tone="danger"
          onConfirm={handleCancel}
          onClose={() => setConfirmCancel(false)}
        />
      ) : null}

      {detail
        ? createPortal(
            <div id="po-print-portal">
              <PurchaseOrderSheet po={detail} />
            </div>,
            document.body
          )
        : null}
    </Modal>
  );
}