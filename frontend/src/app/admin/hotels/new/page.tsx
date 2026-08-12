"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminLayout } from "../../../../components/Shell";
import { API, apiRequest } from "../../../../lib/api";

const steps = [
  "Basic Info",
  "Rooms",
  "Amenities",
  "Price Book",
  "Review",
  "Preview",
];
type OccupancyKey =
  | "single"
  | "double"
  | "triple"
  | "quad"
  | "extrabed"
  | "extraadult"
  | "extrachild"
  | "extraadult2"
  | "extrachild2"
  | "extraadult3"
  | "extrachild3"
  | "extrainfant";
type InventoryDay = {
  id: string;
  date: string;
  available: number;
  stopSell: boolean;
};
type RateDay = {
  id: string;
  date: string;
  amount: string | number;
  taxAmount: string | number;
  occupancyPrices?: Partial<Record<OccupancyKey, string | number>>;
};
type RatePlan = {
  id: string;
  code?: string;
  name: string;
  mealPlan: string;
  rates: RateDay[];
};
type Room = {
  id: string;
  code: string;
  name: string;
  roomTypeTitle?: string | null;
  roomsAvailable?: number;
  preferredFor?: string;
  acAvailable?: boolean;
  active?: boolean;
  maxAdults?: number;
  maxChildren?: number;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  gstType?: string;
  gstPercentage?: string;
  inbuiltAmenities?: string;
  breakfastIncluded?: boolean;
  lunchIncluded?: boolean;
  dinnerIncluded?: boolean;
  images?: HotelImage[];
  ratePlans: RatePlan[];
  inventory: InventoryDay[];
};
type RoomRow = {
  id: string;
  code: string;
  roomTypeTitle: string;
  name: string;
  roomsAvailable: number;
  preferredFor: string[];
  acAvailable: string;
  status: string;
  maxAdults: number;
  maxChildren: number;
  checkInTime: string;
  checkOutTime: string;
  gstType: string;
  gstPercentage: string;
  inbuiltAmenities: string[];
  breakfastIncluded: boolean;
  lunchIncluded: boolean;
  dinnerIncluded: boolean;
  images: HotelImage[];
  galleryFiles: File[];
  galleryPreviewUrls: string[];
  saved: boolean;
};
type HotelImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  published: boolean;
};
type HotelAmenity = {
  hotelId: string;
  amenityId: string;
  quantity?: number;
  availabilityType?: string;
  startTime?: string | null;
  endTime?: string | null;
  active?: boolean;
  amenity: { code: string; name: string };
};
type AmenityRow = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  availability: string;
  startTime: string;
  endTime: string;
  status: string;
  saved: boolean;
};
type Hotel = {
  id: string;
  code?: string;
  name: string;
  slug: string;
  city: string;
  mobile?: string | null;
  email?: string | null;
  place?: string | null;
  country?: string | null;
  state?: string | null;
  address?: string | null;
  pincode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  category?: string | null;
  margin?: string | null;
  powerBackup?: boolean;
  description?: string | null;
  active?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalPath?: string | null;
  ogImageUrl?: string | null;
  images?: HotelImage[];
  rooms?: Room[];
  amenities?: HotelAmenity[];
};
type HotelReview = { id: string; rating: number; description: string; createdAt: string; updatedAt?: string };
type DateRange = { id: string; start: string; end: string };
type PricingValues = {
  amount: number;
  taxAmount: number;
  occupancyPrices: Record<OccupancyKey, number>;
};
type InventoryValues = { available: number; stopSell: boolean };
const occupancyFields: { key: OccupancyKey; label: string }[] = [
  { key: "single", label: "Single (INR)" },
  { key: "double", label: "Double (INR)" },
  { key: "triple", label: "Triple (INR)" },
  { key: "quad", label: "Quad (INR)" },
  { key: "extrabed", label: "Extra bed (INR)" },
  { key: "extraadult", label: "Extra adult (INR)" },
  { key: "extrachild", label: "Extra child (INR)" },
  { key: "extraadult2", label: "Extra adult 2 (INR)" },
  { key: "extrachild2", label: "Extra child 2 (INR)" },
  { key: "extraadult3", label: "Extra adult 3 (INR)" },
  { key: "extrachild3", label: "Extra child 3 (INR)" },
  { key: "extrainfant", label: "Extra infant (INR)" },
];
const blankHotel = {
  code: "",
  name: "",
  slug: "",
  city: "",
  mobile: "",
  email: "",
  place: "",
  country: "",
  state: "",
  address: "",
  pincode: "",
  latitude: "",
  longitude: "",
  category: "",
  margin: "",
  powerBackup: false,
  description: "",
  active: true,
  seoTitle: "",
  seoDescription: "",
  canonicalPath: "",
  ogImageUrl: "",
};
const blankRoom = {
  code: "",
  name: "",
  description: "",
  maxAdults: 2,
  maxChildren: 1,
  maxOccupancy: 3,
};
const blankRoomRow: RoomRow = {
  id: "draft-room-first",
  code: "",
  roomTypeTitle: "",
  name: "",
  roomsAvailable: 0,
  preferredFor: [],
  acAvailable: "No",
  status: "Active",
  maxAdults: 2,
  maxChildren: 1,
  checkInTime: "",
  checkOutTime: "",
  gstType: "Included",
  gstPercentage: "GST - 0%",
  inbuiltAmenities: [],
  breakfastIncluded: false,
  lunchIncluded: false,
  dinnerIncluded: false,
  images: [],
  galleryFiles: [],
  galleryPreviewUrls: [],
  saved: false,
};
function RoomMultiSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string[];
  options: string[];
  placeholder: string;
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  }
  return (
    <div className="roomMultiSelect" ref={containerRef}>
      <button className="roomMultiSelectControl" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className={value.length ? "roomMultiSelectChips" : "roomMultiSelectPlaceholder"}>
          {value.length ? value.map((item) => <span className="roomMultiSelectChip" key={item}>{item}<b onClick={(event) => { event.stopPropagation(); toggle(item); }}>×</b></span>) : placeholder}
        </span>
        <span className="roomMultiSelectChevron">⌄</span>
      </button>
      {open && <div className="roomMultiSelectMenu" role="listbox">{options.map((option) => <button className={`roomMultiSelectOption${value.includes(option) ? " selected" : ""}`} type="button" key={option} onClick={() => toggle(option)}><span>{option}</span>{value.includes(option) ? <b>✓</b> : null}</button>)}</div>}
    </div>
  );
}
function datesBetween(start: string, end: string) {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (start && end && cursor <= last && out.length < 370) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
function rangesFromDates(dates: string[]) {
  const sorted = Array.from(
    new Set(dates.map((date) => date.slice(0, 10))),
  ).sort();
  const ranges: DateRange[] = [];
  let start = "";
  let previous = "";
  sorted.forEach((date) => {
    if (!start) {
      start = date;
      previous = date;
      return;
    }
    const next = new Date(`${previous}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    if (formatDate(next) !== date) {
      ranges.push({ id: `saved-${start}-${previous}`, start, end: previous });
      start = date;
    }
    previous = date;
  });
  if (start)
    ranges.push({ id: `saved-${start}-${previous}`, start, end: previous });
  return ranges;
}
function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
function defaultDateRange() {
  const today = new Date();
  return { start: formatDate(today), end: formatDate(endOfMonth(today)) };
}
function nextDateRange(lastEnd: string) {
  const next = new Date(`${lastEnd}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return { start: formatDate(next), end: formatDate(endOfMonth(next)) };
}
function emptyPricing(): PricingValues {
  return {
    amount: 0,
    taxAmount: 0,
    occupancyPrices: {
      single: 0,
      double: 0,
      triple: 0,
      quad: 0,
      extrabed: 0,
      extraadult: 0,
      extrachild: 0,
      extraadult2: 0,
      extrachild2: 0,
      extraadult3: 0,
      extrachild3: 0,
      extrainfant: 0,
    },
  };
}

export default function NewHotelWizard() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") ?? "";
  const initialStep = Number(searchParams.get("step") ?? 0);
  const [step, setStep] = useState(
    Number.isFinite(initialStep) ? initialStep : 0,
  );
  const [hotel, setHotel] = useState(blankHotel);
  const [hotelId, setHotelId] = useState(editId);
  const [catalog, setCatalog] = useState<Hotel | null>(null);
  const [room, setRoom] = useState(blankRoom);
  const [roomRows, setRoomRows] = useState<RoomRow[]>([]);
  const [amenity, setAmenity] = useState({ code: "", name: "" });
  const [amenityRows, setAmenityRows] = useState<AmenityRow[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<AmenityRow | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState("ALL");
  const [selectedPlanKey, setSelectedPlanKey] = useState("");
  const [dateRanges, setDateRanges] = useState<DateRange[]>([]);
  const [draftRange, setDraftRange] = useState(defaultDateRange);
  const [hiddenPricingRangeIds, setHiddenPricingRangeIds] = useState<string[]>(
    [],
  );
  const [inventoryDateRanges, setInventoryDateRanges] = useState<DateRange[]>(
    [],
  );
  const [inventoryDraftRange, setInventoryDraftRange] =
    useState(defaultDateRange);
  const [hiddenInventoryRangeIds, setHiddenInventoryRangeIds] = useState<
    string[]
  >([]);
  const [pricingByRoom, setPricingByRoom] = useState<
    Record<string, PricingValues>
  >({});
  const [inventoryByRoom, setInventoryByRoom] = useState<
    Record<string, InventoryValues>
  >({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [reviews, setReviews] = useState<HotelReview[]>([]);
  const [reviewForm, setReviewForm] = useState({ rating: "", description: "" });
  const [editingReviewId, setEditingReviewId] = useState("");
  const [reviewSearch, setReviewSearch] = useState("");
  const [reviewPageSize, setReviewPageSize] = useState(10);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewDeleteTarget, setReviewDeleteTarget] = useState<HotelReview | null>(null);
  async function loadCatalog(id = hotelId) {
    if (id) setCatalog(await apiRequest<Hotel>(`/hotels/${id}/catalog`));
  }
  useEffect(() => {
    if (hotelId) void loadCatalog();
  }, [hotelId]);
  useEffect(() => {
    if (catalog?.amenities) {
      const drafts = amenityRows.filter((item) => !item.saved);
      setAmenityRows([
        ...drafts,
        ...catalog.amenities.map((item) => ({
          id: item.amenityId,
          code: item.amenity.code,
          name: item.amenity.name,
          quantity: item.quantity ?? 1,
          availability: item.availabilityType ?? "24/7",
          startTime: item.startTime ?? "",
          endTime: item.endTime ?? "",
          status: item.active === false ? "Inactive" : "Active",
          saved: true,
        })),
      ]);
    } else if (!amenityRows.length)
      setAmenityRows([
        {
          id: "draft-first",
          code: "",
          name: "",
          quantity: 1,
          availability: "24/7",
          startTime: "",
          endTime: "",
          status: "Active",
          saved: false,
        },
      ]);
  }, [catalog?.amenities]);
  useEffect(() => {
    if (catalog?.rooms) {
      const drafts = roomRows.filter((item) => !item.saved);
      setRoomRows([
        ...drafts,
        ...catalog.rooms.map((item) => ({
          id: item.id,
          code: item.code,
          roomTypeTitle: item.roomTypeTitle ?? item.name,
          name: item.name,
          roomsAvailable: item.roomsAvailable ?? 0,
          preferredFor: item.preferredFor ? item.preferredFor.split(",").filter(Boolean) : [],
          acAvailable: item.acAvailable ? "Yes" : "No",
          status: item.active === false ? "Inactive" : "Active",
          maxAdults: item.maxAdults ?? 2,
          maxChildren: item.maxChildren ?? 1,
          checkInTime: item.checkInTime ?? "",
          checkOutTime: item.checkOutTime ?? "",
          gstType: item.gstType ?? "Included",
          gstPercentage: item.gstPercentage ?? "GST - 0%",
          inbuiltAmenities: item.inbuiltAmenities ? item.inbuiltAmenities.split(",").filter(Boolean) : [],
          breakfastIncluded: item.breakfastIncluded ?? false,
          lunchIncluded: item.lunchIncluded ?? false,
          dinnerIncluded: item.dinnerIncluded ?? false,
          images: item.images ?? [],
          galleryFiles: [],
          galleryPreviewUrls: [],
          saved: true,
        })),
      ]);
    } else if (!roomRows.length) setRoomRows([{ ...blankRoomRow }]);
  }, [catalog?.rooms]);
  useEffect(() => {
    if (!editId) return;
    apiRequest<Hotel>(`/hotels/${editId}/catalog`)
      .then((data) => {
        setHotelId(editId);
        setHotel({
          code: data.code ?? "",
          name: data.name,
          slug: data.slug,
          city: data.city,
          mobile: data.mobile ?? "",
          email: data.email ?? "",
          place: data.place ?? "",
          country: data.country ?? "",
          state: data.state ?? "",
          address: data.address ?? "",
          pincode: data.pincode ?? "",
          latitude: data.latitude ?? "",
          longitude: data.longitude ?? "",
          category: data.category ?? "",
          margin: data.margin ?? "",
          powerBackup: data.powerBackup ?? false,
          description: data.description ?? "",
          active: data.active ?? true,
          seoTitle: data.seoTitle ?? "",
          seoDescription: data.seoDescription ?? "",
          canonicalPath: data.canonicalPath ?? "",
          ogImageUrl: data.ogImageUrl ?? "",
        });
        setCatalog(data);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load hotel",
        ),
      );
  }, [editId]);
  const rooms = catalog?.rooms ?? [];
  const filteredReviews = reviews.filter((review) =>
    `${review.rating} ${review.description} ${new Date(review.createdAt).toLocaleDateString()}`.toLowerCase().includes(reviewSearch.toLowerCase()),
  );
  const reviewPageCount = Math.max(1, Math.ceil(filteredReviews.length / reviewPageSize));
  const visibleReviews = filteredReviews.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);
  const reviewFirst = filteredReviews.length ? (reviewPage - 1) * reviewPageSize + 1 : 0;
  const reviewLast = Math.min(reviewPage * reviewPageSize, filteredReviews.length);
  async function loadReviews() {
    if (!hotelId) return;
    try { setReviews(await apiRequest<HotelReview[]>(`/hotels/${hotelId}/reviews`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load reviews"); }
  }
  useEffect(() => { if (step === 4 && hotelId) void loadReviews(); }, [step, hotelId]);
  function resetReviewForm() { setReviewForm({ rating: "", description: "" }); setEditingReviewId(""); }
  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!hotelId || !reviewForm.rating || !reviewForm.description.trim()) { setError("Rating and feedback are required."); return; }
    const result = await request(editingReviewId ? `/hotels/reviews/${editingReviewId}` : `/hotels/${hotelId}/reviews`, { rating: Number(reviewForm.rating), description: reviewForm.description.trim() }, editingReviewId ? "PATCH" : "POST");
    if (result) { resetReviewForm(); await loadReviews(); }
  }
  async function confirmDeleteReview() {
    if (!reviewDeleteTarget) return;
    setBusy(true); setError("");
    try { await apiRequest(`/hotels/reviews/${reviewDeleteTarget.id}`, { method: "DELETE" }); setReviewDeleteTarget(null); await loadReviews(); setMessage("Review deleted."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete review"); }
    finally { setBusy(false); }
  }
  function exportReviews(kind: "copy" | "csv" | "excel") {
    const rows = [["S.NO", "RATING", "DESCRIPTION", "CREATED ON"], ...filteredReviews.map((review, index) => [String(index + 1), String(review.rating), review.description, new Date(review.createdAt).toLocaleDateString()])];
    const text = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    if (kind === "copy") { void navigator.clipboard?.writeText(text); setMessage("Reviews copied."); return; }
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `hotel-reviews.${kind === "excel" ? "xls" : "csv"}`; link.click(); URL.revokeObjectURL(url);
  }
  useEffect(() => {
    setDraftRange(
      dateRanges.length
        ? nextDateRange(dateRanges[dateRanges.length - 1].end)
        : defaultDateRange(),
    );
  }, [dateRanges]);
  useEffect(() => {
    setInventoryDraftRange(
      inventoryDateRanges.length
        ? nextDateRange(inventoryDateRanges[inventoryDateRanges.length - 1].end)
        : defaultDateRange(),
    );
  }, [inventoryDateRanges]);
  useEffect(() => {
    if (step !== 3 && (dateRanges.length || inventoryDateRanges.length)) {
      setDateRanges([]);
      setInventoryDateRanges([]);
      setHiddenPricingRangeIds([]);
      setHiddenInventoryRangeIds([]);
    }
  }, [step, dateRanges.length, inventoryDateRanges.length]);
  useEffect(() => {
    if (!rooms.length) return;
    const firstPlan = rooms.flatMap((item) => item.ratePlans)[0];
    if (!selectedPlanKey && firstPlan) {
      setSelectedPlanKey(firstPlan.code ?? firstPlan.id);
      return;
    }
    if (selectedPlanKey)
      setPricingByRoom(
        Object.fromEntries(
          rooms.map((item) => {
            const plan = item.ratePlans.find(
              (ratePlan) => (ratePlan.code ?? ratePlan.id) === selectedPlanKey,
            );
            const values = emptyPricing();
            const rate = plan?.rates?.[0];
            values.amount = Number(rate?.amount ?? 0);
            values.taxAmount = Number(rate?.taxAmount ?? 0);
            occupancyFields.forEach((field) => {
              values.occupancyPrices[field.key] = Number(
                rate?.occupancyPrices?.[field.key] ?? 0,
              );
            });
            return [item.id, values];
          }),
        ),
      );
  }, [rooms, selectedPlanKey]);
  useEffect(() => {
    if (!rooms.length) return;
    setInventoryByRoom((current) => {
      const next = { ...current };
      rooms.forEach((item) => {
        if (!next[item.id])
          next[item.id] = {
            available: Number(item.inventory?.[0]?.available ?? 0),
            stopSell: Boolean(item.inventory?.[0]?.stopSell),
          };
      });
      return next;
    });
  }, [rooms]);
  async function request(
    path: string,
    body: unknown,
    method: "POST" | "PATCH" = "POST",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<{ id?: string }>(path, {
        method,
        body: JSON.stringify(body),
      });
      setMessage("Saved successfully.");
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function uploadHotelImages(id: string) {
    for (const [index, file] of imageFiles.entries()) {
      const formData = new FormData();
      formData.append("file", file);
      const stored = await apiRequest<{ id: string }>(`/files/hotel-image`, {
        method: "POST",
        body: formData,
      });
      await apiRequest(`/hotels/${id}/images`, {
        method: "POST",
        body: JSON.stringify({
          url: `${API}/files/public/${stored.id}`,
          altText: file.name.replace(/\.[^.]+$/, ""),
          sortOrder: index,
        }),
      });
    }
    setImageFiles([]);
  }
  async function downloadPriceBook() {
    if (!hotelId) return;
    setBusy(true);
    setError("");
    try {
      const token = window.localStorage.getItem("rainwood_access_token");
      const response = await fetch(`${API}/hotels/${hotelId}/pricebook.xlsx`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error("Could not download the price book.");
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${hotel.slug || "rainwood-hotel"}-pricebook.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage("Price book Excel downloaded successfully.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not download the price book",
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteHotelImage(image: HotelImage) {
    if (
      !hotelId ||
      !window.confirm(
        `Delete ${image.altText}? This removes the gallery link and uploaded file permanently.`,
      )
    )
      return;
    try {
      await apiRequest(`/hotels/${hotelId}/images/${image.id}`, {
        method: "DELETE",
      });
      setCatalog((current) =>
        current
          ? {
              ...current,
              images: current.images?.filter((item) => item.id !== image.id),
            }
          : current,
      );
      setMessage("Image deleted successfully.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not delete image",
      );
    }
  }
  async function nextFromBasic(event: FormEvent) {
    event.preventDefault();
    const result = await request(
      hotelId ? `/hotels/${hotelId}` : "/hotels",
      { ...hotel, slug: hotel.slug.trim().toLowerCase() },
      hotelId ? "PATCH" : "POST",
    );
    const savedId = hotelId || result?.id;
    if (savedId) {
      if (result?.id) setHotelId(result.id);
      if (imageFiles.length) {
        setBusy(true);
        try {
          await uploadHotelImages(savedId);
          setMessage("Hotel details and images saved successfully.");
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Hotel saved, but image upload failed",
          );
        } finally {
          setBusy(false);
        }
      }
      setStep(1);
    }
  }
  async function addRoom(event: FormEvent) {
    event.preventDefault();
    if (!hotelId) return;
    const result = await request(`/hotels/${hotelId}/rooms`, room);
    if (result) {
      setRoom(blankRoom);
      await loadCatalog();
    }
  }
  async function saveRoom(row: RoomRow) {
    if (!hotelId || !row.roomTypeTitle.trim() || !row.name.trim()) {
      setError("Enter the room type and room title.");
      return;
    }
    const payload = {
      code: row.code || row.roomTypeTitle.trim().slice(0, 3).toUpperCase(),
      name: row.name.trim(),
      roomTypeTitle: row.roomTypeTitle.trim(),
      roomsAvailable: row.roomsAvailable,
      preferredFor: row.preferredFor.join(","),
      acAvailable: row.acAvailable === "Yes",
      active: row.status === "Active",
      maxAdults: row.maxAdults,
      maxChildren: row.maxChildren,
      maxOccupancy: row.maxAdults + row.maxChildren,
      checkInTime: row.checkInTime || "",
      checkOutTime: row.checkOutTime || "",
      gstType: row.gstType,
      gstPercentage: row.gstPercentage,
      inbuiltAmenities: row.inbuiltAmenities.join(","),
      breakfastIncluded: row.breakfastIncluded,
      lunchIncluded: row.lunchIncluded,
      dinnerIncluded: row.dinnerIncluded,
    };
    const result = row.saved
      ? await request(`/hotels/rooms/${row.id}`, payload, "PATCH")
      : await request(`/hotels/${hotelId}/rooms`, payload);
    const savedRoomId = row.saved ? row.id : result?.id;
    if (savedRoomId && row.galleryFiles.length) {
      for (const [index, file] of row.galleryFiles.entries()) {
        const formData = new FormData();
        formData.append("file", file);
        const stored = await apiRequest<{ id: string }>("/files/hotel-image", { method: "POST", body: formData });
        await apiRequest(`/hotels/rooms/${savedRoomId}/images`, {
          method: "POST",
          body: JSON.stringify({ url: `${API}/files/public/${stored.id}`, altText: file.name.replace(/\.[^.]+$/, ""), sortOrder: row.images.length + index }),
        });
      }
      setRoomRows((current) => current.map((item) => item.id === row.id ? { ...item, galleryFiles: [], galleryPreviewUrls: [] } : item));
    }
    if (result || savedRoomId) await loadCatalog();
  }
  function updateRoomRow(id: string, patch: Partial<RoomRow>) {
    setRoomRows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  function setRoomGalleryFiles(id: string, files: File[]) {
    const previews = files.map((file) => URL.createObjectURL(file));
    setRoomRows((current) => current.map((item) => item.id === id ? { ...item, galleryFiles: files, galleryPreviewUrls: previews } : item));
  }
  function deleteRoomRow(row: RoomRow) {
    if (!row.saved) setRoomRows((current) => current.filter((item) => item.id !== row.id));
    else setError("Persisted room deletion is not enabled yet.");
  }
  async function saveAllRooms() {
    for (const row of roomRows) await saveRoom(row);
    setStep(2);
  }
  async function addAmenity(event: FormEvent) {
    event.preventDefault();
    if (!hotelId) return;
    const result = await request(`/hotels/${hotelId}/amenities`, amenity);
    if (result) {
      setAmenity({ code: "", name: "" });
      await loadCatalog();
    }
  }
  async function saveAmenity(row: AmenityRow) {
    if (!hotelId || !row.name.trim()) {
      setError("Enter an amenity title.");
      return;
    }
    const code =
      row.code ||
      `DVIA${row.name.trim().slice(0, 3)}${Math.floor(100000 + Math.random() * 900000)}`;
    if (row.availability === "Duration" && (!row.startTime || !row.endTime)) {
      setError("Start and end time are required for Duration amenities.");
      return;
    }
    const result = await request(`/hotels/${hotelId}/amenities`, {
      code,
      name: row.name,
      quantity: row.quantity,
      availabilityType: row.availability,
      startTime: row.availability === "Duration" ? row.startTime : "",
      endTime: row.availability === "Duration" ? row.endTime : "",
      active: row.status === "Active",
    });
    if (result) {
      setAmenityRows((current) =>
        current.map((item) =>
          item.id === row.id ? { ...item, code, saved: true } : item,
        ),
      );
      await loadCatalog();
    }
  }
  async function deleteAmenity(row: AmenityRow) {
    if (!hotelId) return;
    if (!row.saved) {
      setAmenityRows((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    setDeleteTarget(row);
  }
  async function confirmDeleteAmenity() {
    if (!hotelId || !deleteTarget) return;
    setBusy(true);
    try {
      await apiRequest(`/hotels/${hotelId}/amenities/${deleteTarget.id}`, {
        method: "DELETE",
      });
      setAmenityRows((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
      await loadCatalog();
      setMessage("Amenity deleted successfully.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not delete amenity",
      );
    } finally {
      setBusy(false);
    }
  }
  const selectedRooms =
    selectedRoomId === "ALL"
      ? rooms
      : rooms.filter((item) => item.id === selectedRoomId);
  const planOptions = Array.from(
    new Map(
      rooms.flatMap((item) =>
        item.ratePlans.map((plan) => [plan.code ?? plan.id, plan] as const),
      ),
    ).values(),
  );
  const selectedPlan = planOptions.find(
    (item) => (item.code ?? item.id) === selectedPlanKey,
  );
  const selectedDates = Array.from(
    new Set(dateRanges.flatMap((item) => datesBetween(item.start, item.end))),
  );
  const selectedInventoryDates = Array.from(
    new Set(
      inventoryDateRanges.flatMap((item) => datesBetween(item.start, item.end)),
    ),
  );
  const savedPricingRanges = rangesFromDates(
    selectedRooms.flatMap((roomItem) =>
      roomItem.ratePlans
        .filter((plan) => (plan.code ?? plan.id) === selectedPlanKey)
        .flatMap((plan) => plan.rates.map((rate) => rate.date)),
    ),
  );
  const savedInventoryRanges = rangesFromDates(
    selectedRooms.flatMap((roomItem) =>
      roomItem.inventory.map((day) => day.date),
    ),
  );
  const pricingDisplayRanges = Array.from(
    new Map(
      [
        ...dateRanges,
        ...savedPricingRanges.filter(
          (item) => !hiddenPricingRangeIds.includes(item.id),
        ),
      ].map((item) => [`${item.start}-${item.end}`, item] as const),
    ).values(),
  );
  const inventoryDisplayRanges = Array.from(
    new Map(
      [
        ...inventoryDateRanges,
        ...savedInventoryRanges.filter(
          (item) => !hiddenInventoryRangeIds.includes(item.id),
        ),
      ].map((item) => [`${item.start}-${item.end}`, item] as const),
    ).values(),
  );
  function addInventoryDateRange() {
    if (
      !inventoryDraftRange.start ||
      !inventoryDraftRange.end ||
      !datesBetween(inventoryDraftRange.start, inventoryDraftRange.end).length
    ) {
      setError("Enter a valid inventory start and end date.");
      return;
    }
    if (
      inventoryDateRanges.some(
        (item) =>
          item.start === inventoryDraftRange.start &&
          item.end === inventoryDraftRange.end,
      )
    ) {
      setError("That inventory date range is already added.");
      return;
    }
    setError("");
    setInventoryDateRanges((current) => [
      ...current,
      {
        id: `${Date.now()}-${inventoryDraftRange.start}`,
        ...inventoryDraftRange,
      },
    ]);
    setInventoryDraftRange({ start: "", end: "" });
  }
  function addDateRange() {
    if (
      !draftRange.start ||
      !draftRange.end ||
      !datesBetween(draftRange.start, draftRange.end).length
    ) {
      setError("Enter a valid start and end date.");
      return;
    }
    if (
      dateRanges.some(
        (item) =>
          item.start === draftRange.start && item.end === draftRange.end,
      )
    ) {
      setError("That date range is already added.");
      return;
    }
    setError("");
    setDateRanges((current) => [
      ...current,
      { id: `${Date.now()}-${draftRange.start}`, ...draftRange },
    ]);
    setDraftRange({ start: "", end: "" });
  }
  function removePricingRange(item: DateRange) {
    setDateRanges((current) => current.filter((range) => range.id !== item.id));
    if (item.id.startsWith("saved-"))
      setHiddenPricingRangeIds((current) => [...current, item.id]);
  }
  function removeInventoryRange(item: DateRange) {
    setInventoryDateRanges((current) =>
      current.filter((range) => range.id !== item.id),
    );
    if (item.id.startsWith("saved-"))
      setHiddenInventoryRangeIds((current) => [...current, item.id]);
  }
  function updatePricing(roomId: string, patch: Partial<PricingValues>) {
    setPricingByRoom((current) => ({
      ...current,
      [roomId]: { ...(current[roomId] ?? emptyPricing()), ...patch },
    }));
  }
  function updateInventory(roomId: string, patch: Partial<InventoryValues>) {
    setInventoryByRoom((current) => ({
      ...current,
      [roomId]: {
        ...(current[roomId] ?? { available: 0, stopSell: false }),
        ...patch,
      },
    }));
  }
  async function savePriceBook() {
    if (!selectedRooms.length || !selectedPlanKey || !selectedDates.length) {
      setError(
        "Select a room, rate plan, and add at least one valid date range for pricing.",
      );
      return;
    }
    for (const target of selectedRooms) {
      const plan = target.ratePlans.find(
        (item) => (item.code ?? item.id) === selectedPlanKey,
      );
      if (!plan) {
        setError(`Rate plan is not configured for ${target.name}.`);
        return;
      }
      const values = pricingByRoom[target.id] ?? emptyPricing();
      await request(`/hotels/rate-plans/${plan.id}/rates`, {
        days: selectedDates.map((date) => ({
          date,
          amount: Number(
            values.amount ||
              values.occupancyPrices.double ||
              values.occupancyPrices.single,
          ),
          taxAmount: Number(values.taxAmount),
          occupancyPrices: values.occupancyPrices,
        })),
      });
    }
    await loadCatalog();
    setMessage(
      `Pricing saved for ${selectedRooms.length} room${selectedRooms.length === 1 ? "" : "s"} across ${selectedDates.length} date${selectedDates.length === 1 ? "" : "s"}.`,
    );
  }
  async function saveInventoryBook() {
    if (!selectedRooms.length || !selectedInventoryDates.length) {
      setError(
        "Select a room and add at least one valid date range for inventory.",
      );
      return;
    }
    for (const target of selectedRooms) {
      const values = inventoryByRoom[target.id] ?? {
        available: 0,
        stopSell: false,
      };
      await request(`/hotels/rooms/${target.id}/inventory`, {
        days: selectedInventoryDates.map((date) => ({
          date,
          available: Number(values.available),
          stopSell: values.stopSell,
        })),
      });
    }
    await loadCatalog();
    setMessage(
      `Inventory saved for ${selectedRooms.length} room${selectedRooms.length === 1 ? "" : "s"} across ${selectedInventoryDates.length} date${selectedInventoryDates.length === 1 ? "" : "s"}.`,
    );
  }
  return (
    <AdminLayout title={editId ? "Edit Hotel" : "Add Hotel"}>
      <div className="wizard">
        <div className="wizardHeader">
          <div>
            <span>Hotel setup</span>
            <h2>
              {editId
                ? "Edit property step by step"
                : "Create property step by step"}
            </h2>
          </div>
          <Link className="btn secondary" href="/admin/hotels">
            Manage Hotels
          </Link>
        </div>
        <div className="wizardSteps">
          {steps.map((label, index) => (
            <button
              type="button"
              className={`wizardStep ${index === step ? "active" : index < step ? "done" : ""}`}
              disabled={index > 0 && !hotelId}
              onClick={() => setStep(index)}
              key={label}
            >
              <b>{index + 1}</b>
              <span>{label}</span>
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {step === 0 && (
          <form className="formCard wizardCard" onSubmit={nextFromBasic}>
            <h2>Basic Info</h2>
            <div className="two">
              <label>
                Hotel name
                <input
                  value={hotel.name}
                  onChange={(e) => setHotel({ ...hotel, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Place / city
                <input
                  value={hotel.city}
                  onChange={(e) => setHotel({ ...hotel, city: e.target.value })}
                  required
                />
              </label>
            </div>
            <div className="two">
              <label>
                Hotel code
                <input
                  value={hotel.code}
                  onChange={(e) => setHotel({ ...hotel, code: e.target.value })}
                  placeholder="RW-MUNNAR"
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={hotel.slug}
                  onChange={(e) => setHotel({ ...hotel, slug: e.target.value })}
                  required
                />
              </label>
            </div>
            <div className="two">
              <label>Hotel mobile<input value={hotel.mobile} onChange={(e) => setHotel({ ...hotel, mobile: e.target.value })} /></label>
              <label>Hotel email<input type="email" value={hotel.email} onChange={(e) => setHotel({ ...hotel, email: e.target.value })} /></label>
            </div>
            <div className="two">
              <label>Hotel place<input value={hotel.place} onChange={(e) => setHotel({ ...hotel, place: e.target.value })} /></label>
              <label>Hotel category<input value={hotel.category} onChange={(e) => setHotel({ ...hotel, category: e.target.value })} /></label>
            </div>
            <div className="two">
              <label>Country<input value={hotel.country} onChange={(e) => setHotel({ ...hotel, country: e.target.value })} /></label>
              <label>State<input value={hotel.state} onChange={(e) => setHotel({ ...hotel, state: e.target.value })} /></label>
            </div>
            <div className="two">
              <label>Pincode<input value={hotel.pincode} onChange={(e) => setHotel({ ...hotel, pincode: e.target.value })} /></label>
              <label>Address<input value={hotel.address} onChange={(e) => setHotel({ ...hotel, address: e.target.value })} /></label>
            </div>
            <div className="two">
              <label>Latitude<input value={hotel.latitude} onChange={(e) => setHotel({ ...hotel, latitude: e.target.value })} /></label>
              <label>Longitude<input value={hotel.longitude} onChange={(e) => setHotel({ ...hotel, longitude: e.target.value })} /></label>
            </div>
            <label className="checkLabel"><input type="checkbox" checked={hotel.powerBackup} onChange={(e) => setHotel({ ...hotel, powerBackup: e.target.checked })} /> Power backup</label>
            <label>
              Description
              <textarea
                value={hotel.description}
                onChange={(e) =>
                  setHotel({ ...hotel, description: e.target.value })
                }
              />
            </label>
            <div className="two">
              <label>
                SEO title
                <input
                  value={hotel.seoTitle}
                  onChange={(e) =>
                    setHotel({ ...hotel, seoTitle: e.target.value })
                  }
                />
              </label>
              <label>
                Legacy hero image URL (optional)
                <input
                  type="url"
                  value={hotel.ogImageUrl}
                  onChange={(e) =>
                    setHotel({ ...hotel, ogImageUrl: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Hotel gallery images (JPEG or PNG)
              <input
                type="file"
                accept="image/jpeg,image/png"
                multiple
                onChange={(e) =>
                  setImageFiles(Array.from(e.target.files ?? []))
                }
              />
              <small className="muted">
                These images are uploaded by Admin and used on public hotel
                cards and detail pages.
              </small>
            </label>
            {catalog?.images?.length ? (
              <div className="hotelImagePreview">
                <b>Uploaded images</b>
                <div className="hotelImageThumbs">
                  {catalog.images.map((image) => (
                    <div className="hotelImageThumb" key={image.id}>
                      <img
                        src={image.url}
                        alt={image.altText}
                        title={image.altText}
                      />
                      <button
                        type="button"
                        className="hotelImageDelete"
                        aria-label={`Delete ${image.altText}`}
                        title="Delete image"
                        onClick={() => void deleteHotelImage(image)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <WizardButtons busy={busy} next="Save & Continue" />
          </form>
        )}
        {step === 1 && (
          <section className="roomsEditStep">
            <div className="roomsToolbar">
              <button className="roomsAddButton" type="button" onClick={() => setRoomRows((current) => [{ ...blankRoomRow, id: `draft-room-${Date.now()}` }, ...current])}>
                + Add Rooms
              </button>
            </div>
            <div className="roomRows">
              {(roomRows.length ? roomRows : [{ ...blankRoomRow }]).map((row, index) => (
                <div className="roomEditRow" key={row.id}>
                  <h3>Room {index + 1}/{roomRows.length || 1}</h3>
                  <div className="roomEditFields">
                    <label>Room Type <em>*</em><input value={row.roomTypeTitle} placeholder="Enter the Room type" onChange={(e) => updateRoomRow(row.id, { roomTypeTitle: e.target.value })} /></label>
                    <label>Room Title <em>*</em><input value={row.name} placeholder="Enter the Room Title" onChange={(e) => updateRoomRow(row.id, { name: e.target.value })} /></label>
                    <label>No of Rooms Availability <em>*</em><input type="number" min="0" value={row.roomsAvailable} placeholder="Enter the No. of Rooms Available" onChange={(e) => updateRoomRow(row.id, { roomsAvailable: Number(e.target.value) })} /></label>
                    <label>Room Code <em>*</em><input value={row.code} placeholder="Enter the Ref Code" readOnly={row.saved} onChange={(e) => updateRoomRow(row.id, { code: e.target.value })} /></label>
                    <label>Preferred For <em>*</em><RoomMultiSelect value={row.preferredFor} options={["Couple", "Family", "Business", "Group"]} placeholder="Select preferred type" onChange={(value) => updateRoomRow(row.id, { preferredFor: value })} /></label>
                    <label>AC Availability <em>*</em><select value={row.acAvailable} onChange={(e) => updateRoomRow(row.id, { acAvailable: e.target.value })}><option>Yes</option><option>No</option></select></label>
                    <label>Status <em>*</em><select value={row.status} onChange={(e) => updateRoomRow(row.id, { status: e.target.value })}><option>Active</option><option>Inactive</option></select></label>
                    <label>Max Adult <em>*</em><input type="number" min="1" value={row.maxAdults} placeholder="Enter the Max Adult" onChange={(e) => updateRoomRow(row.id, { maxAdults: Number(e.target.value) })} /></label>
                    <label>Max Children <em>*</em><input type="number" min="0" value={row.maxChildren} placeholder="Enter the total children" onChange={(e) => updateRoomRow(row.id, { maxChildren: Number(e.target.value) })} /></label>
                    <label>Check-In Time <em>*</em><input type="time" value={row.checkInTime} placeholder="hh:mm" onChange={(e) => updateRoomRow(row.id, { checkInTime: e.target.value })} /></label>
                    <label>Check-Out Time <em>*</em><input type="time" value={row.checkOutTime} placeholder="hh:mm" onChange={(e) => updateRoomRow(row.id, { checkOutTime: e.target.value })} /></label>
                    <label>GST Type <em>*</em><select value={row.gstType} onChange={(e) => updateRoomRow(row.id, { gstType: e.target.value })}><option>Included</option><option>Excluded</option></select></label>
                    <label>GST Percentage <em>*</em><select value={row.gstPercentage} onChange={(e) => updateRoomRow(row.id, { gstPercentage: e.target.value })}><option>GST - 0%</option><option>GST - 5%</option><option>GST - 12%</option><option>GST - 18%</option><option>GST - 28%</option></select></label>
                    <label>Inbuilt Amenities <em>*</em><RoomMultiSelect value={row.inbuiltAmenities} options={["Wi-Fi", "Room Service", "Breakfast", "Swimming Pool", "Parking", "Air Conditioning"]} placeholder="Select amenities" onChange={(value) => updateRoomRow(row.id, { inbuiltAmenities: value })} /></label>
                    <label>Room Gallery <em>*</em><input type="file" accept="image/jpeg,image/png" multiple onChange={(e) => setRoomGalleryFiles(row.id, Array.from(e.target.files ?? []))} /></label>
                  </div>
                  {(row.images.length || row.galleryFiles.length) ? <div className="roomGalleryPreview"><strong>{row.images.length ? "Uploaded Room Gallery" : "Selected Room Gallery"}</strong><div className="roomGalleryThumbs">{row.images.map((image) => <img key={image.id} src={image.url} alt={image.altText} title={image.altText} />)}{row.galleryFiles.map((file, fileIndex) => <img key={`${file.name}-${file.lastModified}`} src={row.galleryPreviewUrls[fileIndex]} alt={file.name} title={file.name} />)}</div></div> : null}
                  <div className="roomFoodOptions"><span>Food Included? (Optional)</span><label><input type="checkbox" checked={row.breakfastIncluded} onChange={(e) => updateRoomRow(row.id, { breakfastIncluded: e.target.checked })} /> Breakfast</label><label><input type="checkbox" checked={row.lunchIncluded} onChange={(e) => updateRoomRow(row.id, { lunchIncluded: e.target.checked })} /> Lunch</label><label><input type="checkbox" checked={row.dinnerIncluded} onChange={(e) => updateRoomRow(row.id, { dinnerIncluded: e.target.checked })} /> Dinner</label></div>
                  <div className="roomRowActions"><button className="roomDeleteButton" type="button" onClick={() => deleteRoomRow(row)}>× Delete</button><button className="roomSaveButton" type="button" disabled={busy} onClick={() => void saveRoom(row)}>{row.saved ? "Update" : "Save"}</button></div>
                </div>
              ))}
            </div>
            <div className="roomActions"><button type="button" className="btn secondary" onClick={() => setStep(0)}>Back</button><button type="button" className="btn" disabled={busy} onClick={() => void saveAllRooms()}>Update &amp; Continue</button></div>
          </section>
        )}
        {step === 2 && (
          <section className="formCard wizardCard amenitiesCard">
            <div className="amenitiesToolbar">
              <button
                className="amenitiesAddButton"
                type="button"
                onClick={() =>
                  setAmenityRows((current) => [
                    {
                      id: `draft-${Date.now()}`,
                      code: "",
                      name: "",
                      quantity: 1,
                      availability: "24/7",
                      startTime: "",
                      endTime: "",
                      status: "Active",
                      saved: false,
                    },
                    ...current,
                  ])
                }
              >
                + Add Amenities
              </button>
            </div>
            <div className="amenityRows">
              {(amenityRows.length
                ? amenityRows
                : [
                    {
                      id: "draft-first",
                      code: "",
                      name: "",
                      quantity: 1,
                      availability: "24/7",
                      startTime: "",
                      endTime: "",
                      status: "Active",
                      saved: false,
                    },
                  ]
              ).map((row, index) => (
                <div className="amenityRow" key={row.id}>
                  <h3>
                    Amenities {index + 1}/{amenityRows.length || 1}
                  </h3>
                  <div
                    className={`amenityFields ${row.availability === "Duration" ? "hasDuration" : ""}`}
                  >
                    <label>
                      Amenities Title <em>*</em>
                      <input
                        value={row.name}
                        placeholder="Enter Amenities Title"
                        onBlur={() => {
                          if (!row.code && row.name.trim())
                            setAmenityRows((current) =>
                              (current.length ? current : [row]).map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      code: `DVIA${row.name.trim().slice(0, 3)}${Math.floor(100000 + Math.random() * 900000)}`,
                                    }
                                  : item,
                              ),
                            );
                        }}
                        onChange={(e) =>
                          setAmenityRows((current) =>
                            (current.length ? current : [row]).map((item) =>
                              item.id === row.id
                                ? { ...item, name: e.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Quantity <em>*</em>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) =>
                          setAmenityRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, quantity: Number(e.target.value) }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Availability Type <em>*</em>
                      <select
                        value={row.availability}
                        onChange={(e) =>
                          setAmenityRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? {
                                    ...item,
                                    availability: e.target.value,
                                    startTime:
                                      e.target.value === "Duration"
                                        ? item.startTime
                                        : "",
                                    endTime:
                                      e.target.value === "Duration"
                                        ? item.endTime
                                        : "",
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        <option>24/7</option>
                        <option>Duration</option>
                      </select>
                    </label>
                    {row.availability === "Duration" && (
                      <>
                        <label>
                          Available Start time <em>*</em>
                          <input
                            type="time"
                            value={row.startTime}
                            onChange={(e) =>
                              setAmenityRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? { ...item, startTime: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Available End time <em>*</em>
                          <input
                            type="time"
                            value={row.endTime}
                            onChange={(e) =>
                              setAmenityRows((current) =>
                                current.map((item) =>
                                  item.id === row.id
                                    ? { ...item, endTime: e.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </>
                    )}
                    <label>
                      Status <em>*</em>
                      <select
                        value={row.status}
                        onChange={(e) =>
                          setAmenityRows((current) =>
                            current.map((item) =>
                              item.id === row.id
                                ? { ...item, status: e.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </label>
                    {row.saved && (
                      <label>
                        Amenities code <em>*</em>
                        <input value={row.code} readOnly />
                      </label>
                    )}
                    <button
                      className="amenityDeleteButton"
                      type="button"
                      onClick={() => void deleteAmenity(row)}
                    >
                      × Delete
                    </button>
                    <button
                      className="amenitySaveButton"
                      type="button"
                      disabled={busy}
                      onClick={() => void saveAmenity(row)}
                    >
                      {row.saved ? "Update" : "Save"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="amenityActions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button type="button" className="btn" onClick={() => setStep(3)}>
                Update &amp; Continue
              </button>
            </div>
          </section>
        )}
        {step === 3 && (
          <section className="formCard wizardCard">
            <h2>Price Book</h2>
            <p>
              Choose one rate plan, add multiple date ranges, and apply pricing
              and inventory to one or all rooms.
            </p>
            <section className="rangeSubcard priceBookFilters">
              <div className="rangeSectionHeader">
                <h3>Price Book Filters</h3>
                <button
                  className="smallBtn"
                  type="button"
                  disabled={busy}
                  onClick={() => void downloadPriceBook()}
                >
                  Download Excel
                </button>
              </div>
              <div className="rangeToolbar">
                <label>
                  Room
                  <select
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                  >
                    <option value="ALL">All rooms</option>
                    {rooms.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Rate plan
                  <select
                    value={selectedPlanKey}
                    onChange={(e) => setSelectedPlanKey(e.target.value)}
                  >
                    <option value="">Select rate plan</option>
                    {planOptions.map((item) => (
                      <option
                        key={item.code ?? item.id}
                        value={item.code ?? item.id}
                      >
                        {item.name} - {item.mealPlan}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={draftRange.start}
                    onChange={(e) =>
                      setDraftRange({ ...draftRange, start: e.target.value })
                    }
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setDraftRange((current) => ({
                        ...current,
                        start: value,
                      }));
                    }}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={draftRange.end}
                    onChange={(e) =>
                      setDraftRange({ ...draftRange, end: e.target.value })
                    }
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setDraftRange((current) => ({ ...current, end: value }));
                    }}
                  />
                </label>
                <button
                  className="smallBtn dateRangeAddButton"
                  type="button"
                  onClick={addDateRange}
                >
                  Add date
                </button>
              </div>
              {pricingDisplayRanges.length > 0 ? (
                <div className="dateRangeList">
                  <b>Date ranges</b>
                  {pricingDisplayRanges.map((item) => (
                    <span key={item.id}>
                      {item.start} - {item.end}
                      <button
                        type="button"
                        aria-label={"Remove " + item.start + " - " + item.end}
                        onClick={() => removePricingRange(item)}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  Add one or more date ranges for pricing.
                </p>
              )}
              {dateRanges.length > 0 && (
                <button
                  className="smallBtn rangeDateSave"
                  type="button"
                  disabled={busy || !selectedDates.length || !selectedPlanKey}
                  onClick={() => void savePriceBook()}
                >
                  Save rates for date ranges
                </button>
              )}
            </section>
            <section className="rangeSubcard">
              <div className="rangeSectionHeader">
                <h3>Room Details / Pricing</h3>
              </div>
              {selectedRooms.length === 0 && (
                <p className="muted">Add a room first.</p>
              )}
              {selectedRooms.map((item) => {
                const values = pricingByRoom[item.id] ?? emptyPricing();
                const roomPlan = item.ratePlans.find(
                  (plan) => (plan.code ?? plan.id) === selectedPlanKey,
                );
                return (
                  <div className="roomForm" key={item.id}>
                    <h3>{item.name}</h3>
                    <p className="muted">
                      {roomPlan
                        ? `${roomPlan.name} - ${roomPlan.mealPlan}`
                        : "Selected rate plan is not configured for this room."}
                    </p>
                    <div className="occupancyGrid">
                      {occupancyFields.map((field) => (
                        <label key={field.key}>
                          {field.label}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={values.occupancyPrices[field.key]}
                            onChange={(e) =>
                              updatePricing(item.id, {
                                occupancyPrices: {
                                  ...values.occupancyPrices,
                                  [field.key]: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Base amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={values.amount}
                        onChange={(e) =>
                          updatePricing(item.id, {
                            amount: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Tax amount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={values.taxAmount}
                        onChange={(e) =>
                          updatePricing(item.id, {
                            taxAmount: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <button
                      className="smallBtn roomPricingSave"
                      type="button"
                      disabled={
                        busy || !selectedDates.length || !selectedPlanKey
                      }
                      onClick={() => void savePriceBook()}
                    >
                      Save pricing
                    </button>
                  </div>
                );
              })}
              {selectedDates.length > 0 && (
                <p className="muted">
                  This will create/update {selectedDates.length} daily rate
                  record(s) for each selected room.
                </p>
              )}
            </section>
            <section className="rangeSubcard">
              <div className="rangeSectionHeader">
                <h3>Room Availability / Inventory</h3>
                <button
                  className="smallBtn"
                  type="button"
                  disabled={busy || !selectedInventoryDates.length}
                  onClick={() => void saveInventoryBook()}
                >
                  Save inventory
                </button>
              </div>
              <div className="rangeToolbar inventoryDateFilters">
                <label>
                  Start date
                  <input
                    type="date"
                    value={inventoryDraftRange.start}
                    onChange={(e) =>
                      setInventoryDraftRange({
                        ...inventoryDraftRange,
                        start: e.target.value,
                      })
                    }
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setInventoryDraftRange((current) => ({
                        ...current,
                        start: value,
                      }));
                    }}
                  />
                </label>
                <label>
                  End date
                  <input
                    type="date"
                    value={inventoryDraftRange.end}
                    onChange={(e) =>
                      setInventoryDraftRange({
                        ...inventoryDraftRange,
                        end: e.target.value,
                      })
                    }
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setInventoryDraftRange((current) => ({
                        ...current,
                        end: value,
                      }));
                    }}
                  />
                </label>
                <button
                  className="smallBtn dateRangeAddButton"
                  type="button"
                  onClick={addInventoryDateRange}
                >
                  Add date
                </button>
              </div>
              {inventoryDisplayRanges.length > 0 ? (
                <div className="dateRangeList">
                  <b>Inventory date ranges</b>
                  {inventoryDisplayRanges.map((item) => (
                    <span key={item.id}>
                      {item.start} - {item.end}
                      <button
                        type="button"
                        aria-label={
                          "Remove inventory " + item.start + " - " + item.end
                        }
                        onClick={() => removeInventoryRange(item)}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  Add inventory date ranges independently from pricing.
                </p>
              )}
              {selectedRooms.map((item) => {
                const values = inventoryByRoom[item.id] ?? {
                  available: 0,
                  stopSell: false,
                };
                return (
                  <div className="roomForm inventoryForm" key={item.id}>
                    <h3>{item.name}</h3>
                    <div className="two">
                      <label>
                        Available rooms
                        <input
                          type="number"
                          min="0"
                          value={values.available}
                          onChange={(e) =>
                            updateInventory(item.id, {
                              available: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="checkboxLabel">
                        <input
                          type="checkbox"
                          checked={values.stopSell}
                          onChange={(e) =>
                            updateInventory(item.id, {
                              stopSell: e.target.checked,
                            })
                          }
                        />{" "}
                        Stop sell
                      </label>
                    </div>
                  </div>
                );
              })}
              <button
                className="btn"
                type="button"
                disabled={busy || !selectedInventoryDates.length}
                onClick={() => void saveInventoryBook()}
              >
                Save inventory for selected rooms
              </button>
              {selectedInventoryDates.length > 0 && (
                <p className="muted">
                  This will create/update {selectedInventoryDates.length} daily
                  inventory record(s) for each selected room.
                </p>
              )}
            </section>
            <WizardButtons
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          </section>
        )}
        {step === 4 && (
          <section className="hotelReviewStep">
            <div className="reviewColumns">
              <form className="reviewFormCard" onSubmit={saveReview}>
                <label className="reviewRatingLabel">Rating</label>
                <select value={reviewForm.rating} onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))}>
                  <option value="">Select Rating</option>
                  {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} Star{rating > 1 ? "s" : ""}</option>)}
                </select>
                <p className="reviewNote">All reviews are from genuine customers</p>
                <label>Feedback <em>*</em></label>
                <textarea rows={4} value={reviewForm.description} onChange={(event) => setReviewForm((current) => ({ ...current, description: event.target.value }))} />
                <div className="reviewFormActions">
                  <button type="button" className="reviewCancelButton" onClick={resetReviewForm}>Cancel</button>
                  <button type="submit" className="reviewSaveButton" disabled={busy}>{editingReviewId ? "Update" : "Save"}</button>
                </div>
              </form>
              <section className="reviewListCard">
                <h2>List of Reviews</h2>
                <div className="reviewToolbar">
                  <label>Show <select value={reviewPageSize} onChange={(event) => { setReviewPageSize(Number(event.target.value)); setReviewPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select> entries</label>
                  <label className="reviewSearch">Search: <input value={reviewSearch} onChange={(event) => { setReviewSearch(event.target.value); setReviewPage(1); }} /></label>
                  <button type="button" onClick={() => exportReviews("copy")}>Copy</button><button type="button" onClick={() => exportReviews("excel")}>Excel</button><button type="button" onClick={() => exportReviews("csv")}>CSV</button>
                </div>
                <div className="reviewTableWrap"><table className="reviewTable"><thead><tr><th>S.NO</th><th>RATING</th><th>DESCRIPTION</th><th>CREATED ON</th><th>ACTIONS</th></tr></thead><tbody>
                  {visibleReviews.length ? visibleReviews.map((review, index) => <tr key={review.id}><td>{reviewFirst + index}</td><td><span className="reviewStars" aria-label={`${review.rating} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <span key={star} className={star <= review.rating ? "filled" : ""}>★</span>)}</span></td><td>{review.description}</td><td>{new Date(review.createdAt).toLocaleDateString()}</td><td><button type="button" className="reviewEditButton" onClick={() => { setEditingReviewId(review.id); setReviewForm({ rating: String(review.rating), description: review.description }); }}>Edit</button><button type="button" className="reviewDeleteButton" onClick={() => setReviewDeleteTarget(review)}>Delete</button></td></tr>) : <tr><td colSpan={5} className="reviewEmpty">No data available in table</td></tr>}
                </tbody></table></div>
                <div className="reviewTableFooter"><span>Showing {reviewFirst} to {reviewLast} of {filteredReviews.length} entries</span><div><button type="button" disabled={reviewPage <= 1} onClick={() => setReviewPage((page) => Math.max(1, page - 1))}>Previous</button><button type="button" disabled={reviewPage >= reviewPageCount} onClick={() => setReviewPage((page) => Math.min(reviewPageCount, page + 1))}>Next</button></div></div>
              </section>
            </div>
            <div className="reviewStepActions"><button type="button" className="backButton" onClick={() => setStep(3)}>Back</button><button type="button" className="primaryButton" onClick={() => setStep(5)}>Update &amp; Continue</button></div>
          </section>
        )}
        {step === 5 && (
          <section className="hotelPreviewStep">
            <div className="hotelPreviewCard">
              <h2>Basic Info</h2>
              <div className="hotelPreviewGrid">
                {[
                  ["Hotel Name", hotel.name], ["Hotel Code", hotel.code], ["Hotel Mobile", hotel.mobile], ["Hotel Email", hotel.email],
                  ["Hotel Place", hotel.place || hotel.city], ["Hotel Category", hotel.category], ["Country", hotel.country], ["State", hotel.state],
                  ["City", hotel.city], ["Pincode", hotel.pincode], ["Latitude", hotel.latitude], ["Longitude", hotel.longitude],
                  ["Address", hotel.address], ["Hotel Status", hotel.active ? "Active" : "In-Active"], ["Hotel Margin %", hotel.margin], ["Power Backup", hotel.powerBackup ? "Yes" : "No"],
                ].map(([label, value]) => <div key={label} className={label === "Hotel Status" ? "previewStatus" : ""}><label>{label}</label><p>{value || "—"}</p></div>)}
              </div>
            </div>
          </section>
        )}
      </div>
      {deleteTarget && (
        <div className="amenityModalBackdrop" role="presentation">
          <div
            className="amenityDeleteModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="amenity-delete-title"
          >
            <button
              className="amenityModalClose"
              type="button"
              aria-label="Close"
              onClick={() => setDeleteTarget(null)}
            >
              ×
            </button>
            <h2 id="amenity-delete-title">Confirmation Alert?</h2>
            <div className="amenityTrashIcon">♜</div>
            <p>
              Are you sure? want to delete this amenities{" "}
              <strong>"{deleteTarget.name}"</strong>
              <br />
              This action cannot be undone.
            </p>
            <div className="amenityModalActions">
              <button
                type="button"
                className="amenityCloseButton"
                onClick={() => setDeleteTarget(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="amenityConfirmDelete"
                disabled={busy}
                onClick={() => void confirmDeleteAmenity()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {reviewDeleteTarget && (
        <div className="reviewModalBackdrop" role="presentation">
          <div className="reviewDeleteModal" role="dialog" aria-modal="true" aria-labelledby="review-delete-title">
            <button className="reviewModalClose" type="button" aria-label="Close" onClick={() => setReviewDeleteTarget(null)}>×</button>
            <h2 id="review-delete-title">Confirmation Alert?</h2>
            <div className="reviewTrashIcon">♜</div>
            <p>Are you sure you want to delete this review?<br />This action cannot be undone.</p>
            <div className="reviewModalActions"><button type="button" className="reviewModalCancel" onClick={() => setReviewDeleteTarget(null)}>Close</button><button type="button" className="reviewModalConfirm" disabled={busy} onClick={() => void confirmDeleteReview()}>Delete</button></div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
function WizardButtons({
  onBack,
  onNext,
  busy,
  next = "Continue",
}: {
  onBack?: () => void;
  onNext?: () => void;
  busy?: boolean;
  next?: string;
}) {
  return (
    <div className="wizardButtons">
      {onBack && (
        <button type="button" className="btn secondary" onClick={onBack}>
          Back
        </button>
      )}
      {onNext && (
        <button type="button" className="btn" onClick={onNext}>
          {next}
        </button>
      )}
      {!onNext && (
        <button className="btn" disabled={busy}>
          {busy ? "Saving..." : next}
        </button>
      )}
    </div>
  );
}
