'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AgentWorkspace } from '../../../components/AgentData';
import { apiRequest } from '../../../lib/api';

type Wallet = { currency: string; balance: number | string; transactions: { id: string; type: string; amount: number | string; balanceAfter: number | string; reference?: string | null; createdAt: string }[] };

function WalletContent() {
  const [wallet, setWallet] = useState<Wallet | null>(null); const [amount, setAmount] = useState('25000'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function load() { try { setWallet(await apiRequest<Wallet>('/wallet')); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load wallet'); } }
  useEffect(() => { void load(); }, []);
  async function recharge(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const updated = await apiRequest<Wallet>('/wallet/recharge', { method: 'POST', body: JSON.stringify({ amount: Number(amount), reference: `CHROME-RECHARGE-${Date.now()}` }) }); setWallet(updated); setMessage(`Wallet recharged by INR ${Number(amount).toFixed(2)}.`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not recharge wallet'); } finally { setBusy(false); } }
  if (!wallet) return <p className="loading">Loading wallet...</p>;
  return <><div className="walletBalance"><span>Available wallet balance</span><strong>INR {Number(wallet.balance).toFixed(2)}</strong><small>Bookings made by this agent are deducted from this balance.</small></div><section className="formCard walletRecharge"><h2>Recharge wallet</h2><p className="mutedText">Local demo recharge. Production can connect this form to the payment gateway.</p>{error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<form onSubmit={recharge}><div className="two"><label>Amount (INR)<input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><div className="walletFormAction"><button className="btn" disabled={busy}>{busy ? 'Adding...' : 'Add money'}</button></div></div></form></section><section className="panel"><h2>Wallet transactions</h2>{!wallet.transactions.length ? <p className="empty">No wallet transactions yet.</p> : <div className="tableScroll"><table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Amount</th><th>Balance after</th></tr></thead><tbody>{wallet.transactions.map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td><span className={`status ${transaction.type === 'RECHARGE' ? 'ok' : 'warn'}`}>{transaction.type.replace('_', ' ')}</span></td><td>{transaction.reference || ' - '}</td><td className={Number(transaction.amount) >= 0 ? 'walletCredit' : 'walletDebit'}>{Number(transaction.amount) >= 0 ? '+' : ''} INR {Number(transaction.amount).toFixed(2)}</td><td>INR {Number(transaction.balanceAfter).toFixed(2)}</td></tr>)}</tbody></table></div>}</section></>;
}

export default function AgentWalletPage() { return <AgentWorkspace title="Wallet">{() => <WalletContent />}</AgentWorkspace>; }
