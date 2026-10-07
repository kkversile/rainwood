import { Injectable } from '@nestjs/common';

function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));
}

function money(value: unknown) { return `INR ${Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

@Injectable()
export class AgentRateSheetRenderer {
  render(snapshot: any) {
    const mealOrder = ['EP', 'CP', 'MAP', 'AP'];
    const hotels = Array.isArray(snapshot?.hotels) ? snapshot.hotels : [];
    const hotelSections = hotels.map((hotel: any) => {
      const rows = (hotel.rooms ?? []).flatMap((room: any) => mealOrder.flatMap((meal) => {
        const rates = (room.rates ?? []).filter((item: any) => String(item.mealPlan).toUpperCase() === meal).sort((left: any, right: any) => String(left.validFrom).localeCompare(String(right.validFrom)));
        return rates.length ? rates.map((rate: any) => `<tr><td>${escape(room.name ?? room.code)}</td><td>${escape(meal)}</td><td>${escape(rate.validFrom)}</td><td>${escape(rate.validTo)}</td><td>${money(rate.amount)}</td><td>${money(rate.extraAdultAmount)}</td><td>${money(rate.extraChildWithBedAmount)}</td><td>${money(rate.childWithoutBedAmount)}</td></tr>`) : [`<tr><td>${escape(room.name ?? room.code)}</td><td>${escape(meal)}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`];
      })).join('');
      const supplements = (hotel.supplements ?? []).map((item: any) => `<li>${escape(item.name)} · ${escape(item.startDate)} - ${escape(item.endDate)} · ${money(item.amountPerRoomNight)} per room/night (${escape(item.scope)})</li>`).join('') || '<li>No agent supplements published for this validity.</li>';
      const canonicalLink = typeof hotel.canonicalLink === 'string' && (hotel.canonicalLink.startsWith('http://') || hotel.canonicalLink.startsWith('https://') || hotel.canonicalLink.startsWith('/')) ? hotel.canonicalLink : '';
      const link = canonicalLink ? `<a target="_blank" rel="noopener noreferrer" href="${escape(canonicalLink)}">View property</a>` : '';
      return `<section class="property"><h2>${escape(hotel.name)} <small>${escape(hotel.city)}</small></h2><p>${escape(hotel.description)}</p><p>${link}</p><table><thead><tr><th>Room</th><th>Meal</th><th>Valid from</th><th>Valid to</th><th>Contract rate</th><th>Extra adult</th><th>Child with bed</th><th>Child without bed</th></tr></thead><tbody>${rows}</tbody></table><h3>Property supplements</h3><ul>${supplements}</ul><h3>Property inclusions</h3><p>${escape(hotel.inclusions)}</p><h3>Property guidelines</h3><p>${escape(hotel.guidelines)}</p>${hotel.terms ? `<h3>Booking terms</h3><p>${escape(hotel.terms)}</p>` : ''}${(hotel.bankAccounts ?? []).length ? `<h3>Payment details</h3>${hotel.bankAccounts.map((bank: any) => `<p><b>${escape(bank.accountName)}</b> · ${escape(bank.bankName)}${bank.branch ? ` · ${escape(bank.branch)}` : ''} · A/C ${escape(bank.accountNumber)}${bank.ifsc ? ` · IFSC ${escape(bank.ifsc)}` : ''}${bank.accountType ? ` · ${escape(bank.accountType)}` : ''}</p>`).join('')}` : ''}</section>`;
    }).join('');
    const previewState = snapshot?.previewState;
    const unassigned = previewState && previewState !== 'ASSIGNED_CONTRACT_PREVIEW' ? `<div class="warning">${escape(previewState.replaceAll('_', ' '))} - not a publishable agent contract</div>` : '';
    const contract = snapshot?.contract ?? snapshot?.slab ?? {};
    return `<!doctype html><html><head><meta charset="utf-8"><title>RainWood Agent Rate Sheet</title><style>body{font-family:Arial,sans-serif;color:#123b57;margin:32px;line-height:1.45}header{border-bottom:4px solid #06a6a9;padding-bottom:18px;margin-bottom:20px}h1{margin:0;color:#073b5c}h2{color:#078e98;margin-bottom:4px}h3{color:#d38b19}.meta{color:#526b78}.warning{background:#fff3cd;border:1px solid #d39e00;padding:12px;margin:18px 0;font-weight:bold}.property{border-top:1px solid #b9d5dc;padding-top:20px;margin-top:24px;page-break-inside:avoid}small{font-weight:normal;color:#526b78}table{border-collapse:collapse;width:100%;margin:16px 0}th{background:#075779;color:white}th,td{border:1px solid #c5dce2;padding:8px;text-align:left}a{color:#078e98;font-weight:bold}</style></head><body><header><h1>RainWood Hotels - Agent Rate Sheet</h1><p class="meta"><b>Agent:</b> ${escape(snapshot?.agent?.name)}${snapshot?.agent?.companyName ? ` · ${escape(snapshot.agent.companyName)}` : ''} · ${escape(snapshot?.agent?.email)}</p><p class="meta"><b>Contract:</b> ${escape(contract.code)} - ${escape(contract.name)} · Version ${escape(contract.version ?? 'Published')} · ${escape(contract.validFrom)} to ${escape(contract.validTo)}</p></header>${unassigned}${hotelSections || '<p>No hotel rates are included in this sheet.</p>'}<footer><p class="meta">Rates are contracted base rates. Promotions are separate and apply only when explicitly enabled for the AGENT channel.</p></footer></body></html>`;
  }
}
