export default function Pagination({
  page = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onChange = () => {},
}) {
  const safePage = Number(page) > 0 ? Number(page) : 1;
  const safeTotalPages = Number(totalPages) > 0 ? Number(totalPages) : 1;
  const pageNumbers = Array.from({ length: safeTotalPages }, (_, index) => index + 1);

  const startItem = totalItems > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endItem = totalItems > 0 ? Math.min(safePage * pageSize, totalItems) : 0;

  return (
    <div className="list-footer">
      <span className="list-footer-count">
        {totalItems > 0 ? `Showing ${startItem} to ${endItem} of ${totalItems} entries` : 'Showing 0 entries'}
      </span>

      <nav className="pagination" aria-label="Pagination">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onChange(safePage - 1)}
          disabled={safePage <= 1}
        >
          Previous
        </button>

        {pageNumbers.map((number) => (
          <button
            key={number}
            type="button"
            className={number === safePage ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            onClick={() => onChange(number)}
            aria-current={number === safePage ? 'page' : undefined}
          >
            {number}
          </button>
        ))}

        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onChange(safePage + 1)}
          disabled={safePage >= safeTotalPages}
        >
          Next
        </button>
      </nav>
    </div>
  );
}