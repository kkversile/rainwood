import Link from 'next/link';
export default function NotFound() { return <main className="page"><div className="pageTitle public"><span>404</span><h1>We could not find that page</h1><p>The hotel or reservation page may no longer be published.</p><Link className="btn" href="/hotels">Browse hotels</Link></div></main>; }
