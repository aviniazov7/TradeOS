import './home.css';

// Matches the signed-in home: masthead, hero beside recent trades, then the
// KPI strip. Shown only while trades are still loading.
export default function DashboardSkeleton() {
  return (
    <div className="home-dash" aria-hidden>
      <div>
        <div className="home-pending" style={{ height: 14, width: 180, marginBottom: 10 }} />
        <div className="home-pending" style={{ height: 32, width: 220 }} />
      </div>
      <div className="split">
        <div className="home-pending" style={{ height: 320 }} />
        <div className="home-pending" style={{ height: 320 }} />
      </div>
      <div className="home-pending" style={{ height: 140 }} />
      <div className="split">
        <div className="home-pending" style={{ height: 220 }} />
        <div className="home-pending" style={{ height: 220 }} />
      </div>
    </div>
  );
}
