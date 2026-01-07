export default function DefaultInput({ className = '', ...props }) {
  return (
    <input
      className={`bg-gray-100 h-12 w-full px-4 py-2 border-0 rounded-xl ${className}`}
      {...props}
      required
    />
  );
}