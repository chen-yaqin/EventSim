export default function ToastStack({ items }) {
  return (
    <div className="toast-stack">
      {items.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind || "info"}`}>
          {item.message}
        </div>
      ))}
    </div>
  );
}
