import { Card } from '../../../components/Card/Card';
import type { OpenOrder } from '../../../types/dashboard';
import styles from './OpenOrdersPanel.module.css';

interface OpenOrdersPanelProps {
  orders: OpenOrder[];
}

const currency = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
});

/** Open Orders panel: table of orders with expandable line rows. */
export function OpenOrdersPanel({ orders }: OpenOrdersPanelProps) {
  return (
    <Card>
      <h3 className={styles.heading}>Open Orders</h3>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Order ID</th>
            <th>Status</th>
            <th>Order Date</th>
            <th>Delivery Date</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <OrderRows key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function OrderRows({ order }: { order: OpenOrder }) {
  return (
    <>
      <tr className={styles.orderRow}>
        <td className={styles.orderId}>{order.orderId}</td>
        <td>{order.status}</td>
        <td>{order.orderDate}</td>
        <td>{order.deliveryDate}</td>
      </tr>
      {order.lines.length > 0 && (
        <tr>
          <td colSpan={4} className={styles.linesCell}>
            <div className={styles.lines}>
              {order.lines.map((line) => (
                <div key={line.id} className={styles.lineRow}>
                  <span className={styles.lineName}>{line.name}</span>
                  <span className={styles.lineAmount}>{currency.format(line.amount)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
