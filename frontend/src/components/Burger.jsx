export default function Burger({ open, onClick }) {
  return (
    <button className="burger" type="button" onClick={onClick} aria-label="Меню">
      <span className={`burger-line${open ? " open" : ""}`} />
      <span className={`burger-line${open ? " open" : ""}`} />
      <span className={`burger-line${open ? " open" : ""}`} />
    </button>
  );
}
