import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import { formatCurrency, formatThousands, parseAmount } from "../utils/formatters";
import {
  simulateLoan, TUNAI, KPR, LEASING,
  BUNGA_TETAP, FIXED_LALU_FLOATING, BUNGA_BERJENJANG, STRUKTUR_BUNGA, BATAS,
} from "../utils/loanSimulation";
import Dropdown from "./Dropdown";
import { colors, radius } from "../theme";

const JENIS = [
  { value: TUNAI, ikon: "💵", label: "Tunai", sub: "Pinjaman tunai" },
  { value: KPR, ikon: "🏠", label: "KPR", sub: "Kredit rumah" },
  { value: LEASING, ikon: "🚗", label: "Leasing", sub: "Pembiayaan kendaraan" },
];

const juta = (n) =>
  n >= 1000000000 ? `Rp${n / 1000000000} miliar` : `Rp${Math.round(n / 1000000)} juta`;

const KOSONG = {
  pokok: "", harga: "", uangMuka: "", uangMukaMode: "Rp",
  tenorBulan: "", tenorTahun: "", bungaPersen: "",
  strukturBunga: BUNGA_TETAP, periodeFixedTahun: "", bungaFloatingPersen: "",
  periodeJenjangTahun: "", bungaJenjangPersen: "",
  biayaProvisiPersen: "", biayaAdministrasi: "", biayaAppraisal: "",
  biayaNotarisPersen: "", pendaftaranFidusia: "", asuransiPersenPerTahun: "",
};

// Nilai awal "perkiraan awal" buat blok Asumsi, beda per jenis pinjaman.
const ASUMSI_AWAL = {
  [TUNAI]: { biayaProvisiPersen: "2", biayaAdministrasi: "25000" },
  [KPR]: {
    biayaProvisiPersen: "1", biayaAdministrasi: "500000", biayaAppraisal: "1000000",
    biayaNotarisPersen: "1", asuransiPersenPerTahun: "0,25",
  },
  [LEASING]: {
    biayaProvisiPersen: "1", biayaAdministrasi: "1500000",
    pendaftaranFidusia: "300000", asuransiPersenPerTahun: "2",
  },
};

// WAJIB di luar komponen. Kalau didefinisikan di dalam, tiap render React
// menganggapnya tipe komponen BARU, jadi isinya di-unmount lalu dipasang lagi
// -- dan TextInput kehilangan fokus tiap satu huruf diketik.
const Baris = ({ label, info, children, salah }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
    {salah ? <Text style={styles.salah}>{salah}</Text> : null}
    {info ? <Text style={styles.info}>{info}</Text> : null}
  </View>
);

export default function CreditCalculator({ onBack }) {
  const [jenis, setJenis] = useState(TUNAI);
  const [form, setForm] = useState({ ...KOSONG, ...ASUMSI_AWAL[TUNAI] });
  const [asumsiTerbuka, setAsumsiTerbuka] = useState(false);
  const [awalTerbuka, setAwalTerbuka] = useState(false);

  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));
  const gantiJenis = (next) => {
    setJenis(next);
    setForm({ ...KOSONG, ...ASUMSI_AWAL[next] });
  };

  const batas = BATAS[jenis];
  const harga = parseAmount(form.harga);
  const uangMuka =
    form.uangMukaMode === "%"
      ? (harga * (Number(String(form.uangMuka).replace(",", ".")) || 0)) / 100
      : parseAmount(form.uangMuka);

  const hasil = useMemo(
    () => simulateLoan(jenis, { ...form, harga, uangMuka, pokok: parseAmount(form.pokok) }),
    [jenis, form, harga, uangMuka]
  );

  // Berapa isian utama yang sudah diisi -- dipakai buat bar "N dari 4 terisi"
  // waktu hasilnya belum bisa dihitung.
  const utama =
    jenis === TUNAI
      ? [form.pokok, form.tenorBulan, form.bungaPersen, form.biayaProvisiPersen]
      : jenis === KPR
        ? [form.harga, form.uangMuka, form.tenorTahun, form.bungaPersen]
        : [form.harga, form.uangMuka, form.tenorBulan, form.bungaPersen];
  const terisi = utama.filter((v) => String(v).trim() !== "").length;

  const salahHarga =
    jenis !== TUNAI && form.harga !== "" && (harga < batas.harga[0] || harga > batas.harga[1]);
  const salahPokok =
    jenis === TUNAI && form.pokok !== "" &&
    (parseAmount(form.pokok) < batas.pokok[0] || parseAmount(form.pokok) > batas.pokok[1]);
  const salahDp = jenis !== TUNAI && form.uangMuka !== "" && harga > 0 && uangMuka > harga * 0.7;

  const uang = (key, props = {}) => (
    <TextInput
      style={[styles.input, props.salah && styles.inputSalah]}
      keyboardType="number-pad"
      placeholder={props.placeholder}
      placeholderTextColor={colors.textFaint}
      value={formatThousands(form[key])}
      onChangeText={(t) => set(key)(String(parseAmount(t) || ""))}
    />
  );
  const angka = (key, props = {}) => (
    <TextInput
      style={[styles.input, styles.inputKecil, props.salah && styles.inputSalah]}
      keyboardType="decimal-pad"
      placeholder={props.placeholder}
      placeholderTextColor={colors.textFaint}
      value={String(form[key])}
      onChangeText={set(key)}
    />
  );
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Simulasi cicilan pinjaman</Text>
          <Text style={styles.subtitle}>Hitung cicilan bulanan dari rencana pinjaman kamu.</Text>
        </View>
      </View>

      <View style={styles.jenisRow}>
        {JENIS.map((j) => {
          const aktif = jenis === j.value;
          return (
            <Pressable
              key={j.value}
              style={[styles.jenisCard, aktif && styles.jenisCardAktif]}
              onPress={() => gantiJenis(j.value)}
            >
              <Text style={styles.jenisIkon}>{j.ikon}</Text>
              <Text style={[styles.jenisLabel, aktif && styles.jenisLabelAktif]}>{j.label}</Text>
              <Text style={styles.jenisSub}>{j.sub}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Detail pinjaman</Text>
        <View style={styles.sectionRule} />

        {jenis === TUNAI ? (
          <>
            <Baris
              label="Jumlah pinjaman"
              salah={salahPokok ? `Masukkan ${juta(batas.pokok[0])} sampai ${juta(batas.pokok[1])}.` : ""}
            >
              {uang("pokok", { placeholder: "Jumlah yang ingin dipinjam", salah: salahPokok })}
            </Baris>
            <Baris label="Tenor" info="bulan">
              {angka("tenorBulan", { placeholder: "Berapa bulan untuk melunasi" })}
            </Baris>
            <Baris label="Suku bunga per bulan" info="%">
              {angka("bungaPersen", { placeholder: "Suku bunga per bulan" })}
            </Baris>
          </>
        ) : (
          <>
            <Baris
              label={jenis === KPR ? "Harga properti" : "Harga kendaraan"}
              salah={salahHarga ? `Masukkan ${juta(batas.harga[0])} sampai ${juta(batas.harga[1])}.` : ""}
            >
              {uang("harga", {
                placeholder: jenis === KPR ? "Harga properti yang dibeli" : "Harga kendaraan yang dibeli",
                salah: salahHarga,
              })}
            </Baris>

            <Baris
              label="Uang muka (DP)"
              salah={salahDp ? "Masukkan jumlah maksimal 70% dari harga." : ""}
              info={
                form.uangMukaMode === "%" && harga > 0 && form.uangMuka !== ""
                  ? `Menjadi ${formatCurrency(Math.round(uangMuka))}`
                  : ""
              }
            >
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }, salahDp && styles.inputSalah]}
                  keyboardType="decimal-pad"
                  placeholder={form.uangMukaMode === "%" ? "Persentase dari harga" : "Jumlah yang dibayar di awal"}
                  placeholderTextColor={colors.textFaint}
                  value={form.uangMukaMode === "%" ? String(form.uangMuka) : formatThousands(form.uangMuka)}
                  onChangeText={(t) =>
                    set("uangMuka")(form.uangMukaMode === "%" ? t : String(parseAmount(t) || ""))
                  }
                />
                <View style={styles.modeToggle}>
                  {["Rp", "%"].map((m) => (
                    <Pressable
                      key={m}
                      style={[styles.modeButton, form.uangMukaMode === m && styles.modeButtonAktif]}
                      onPress={() => setForm((p) => ({ ...p, uangMukaMode: m, uangMuka: "" }))}
                    >
                      <Text style={[styles.modeText, form.uangMukaMode === m && styles.modeTextAktif]}>{m}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </Baris>

            {jenis === KPR ? (
              <>
                <Baris label="Tenor" info="tahun">
                  {angka("tenorTahun", { placeholder: "Berapa tahun untuk melunasi" })}
                </Baris>
                <Baris label="Struktur bunga">
                  <Dropdown
                    options={STRUKTUR_BUNGA}
                    value={form.strukturBunga}
                    onChange={set("strukturBunga")}
                  />
                </Baris>
                <Baris
                  label={form.strukturBunga === BUNGA_TETAP ? "Suku bunga per tahun" : "Suku bunga tahap 1 per tahun"}
                  info="%"
                >
                  {angka("bungaPersen", { placeholder: "Suku bunga per tahun" })}
                </Baris>
                {form.strukturBunga !== BUNGA_TETAP && (
                  <>
                    <Baris label="Lama tahap 1" info="tahun">
                      {angka("periodeFixedTahun", { placeholder: "Berapa tahun bunga tahap 1" })}
                    </Baris>
                    {form.strukturBunga === BUNGA_BERJENJANG && (
                      <>
                        <Baris label="Suku bunga tahap 2 per tahun" info="%">
                          {angka("bungaJenjangPersen", { placeholder: "Suku bunga tahap 2" })}
                        </Baris>
                        <Baris label="Lama tahap 2" info="tahun">
                          {angka("periodeJenjangTahun", { placeholder: "Berapa tahun bunga tahap 2" })}
                        </Baris>
                      </>
                    )}
                    <Baris label="Suku bunga floating per tahun" info="%">
                      {angka("bungaFloatingPersen", { placeholder: "Suku bunga sesudahnya" })}
                    </Baris>
                  </>
                )}
              </>
            ) : (
              <>
                <Baris label="Tenor" info="bulan">
                  {angka("tenorBulan", { placeholder: "Berapa bulan untuk melunasi" })}
                </Baris>
                <Baris label="Suku bunga per tahun" info="%">
                  {angka("bungaPersen", { placeholder: "Suku bunga per tahun" })}
                </Baris>
              </>
            )}
          </>
        )}

        <Pressable style={styles.asumsiHeader} onPress={() => setAsumsiTerbuka((v) => !v)}>
          <Text style={styles.asumsiTitle}>Asumsi</Text>
          <Text style={styles.asumsiHint}>
            {hasil ? `Biaya ${formatCurrency(hasil.biaya.total)}` : "Perkiraan awal"} {asumsiTerbuka ? "▲" : "▼"}
          </Text>
        </Pressable>

        {asumsiTerbuka && (
          <View style={styles.asumsiBody}>
            <Baris
              label="Biaya provisi"
              info={
                hasil
                  ? `% dari pinjaman · menjadi ${formatCurrency(
                      Math.round(((Number(String(form.biayaProvisiPersen).replace(",", ".")) || 0) / 100) * hasil.pokok)
                    )}`
                  : "% dari pinjaman"
              }
            >
              {angka("biayaProvisiPersen")}
            </Baris>
            <Baris label="Biaya administrasi">{uang("biayaAdministrasi")}</Baris>
            {jenis === KPR && (
              <>
                <Baris label="Biaya appraisal">{uang("biayaAppraisal")}</Baris>
                <Baris label="Biaya notaris dan akta" info="% dari pinjaman">
                  {angka("biayaNotarisPersen")}
                </Baris>
                <Baris label="Asuransi jiwa dan properti" info="% per tahun">
                  {angka("asuransiPersenPerTahun")}
                </Baris>
              </>
            )}
            {jenis === LEASING && (
              <>
                <Baris label="Pendaftaran fidusia">{uang("pendaftaranFidusia")}</Baris>
                <Baris label="Asuransi kendaraan" info="% per tahun">
                  {angka("asuransiPersenPerTahun")}
                </Baris>
              </>
            )}
            <Pressable onPress={() => setForm((p) => ({ ...p, ...ASUMSI_AWAL[jenis] }))}>
              <Text style={styles.reset}>Reset asumsi</Text>
            </Pressable>
          </View>
        )}
      </View>

      {hasil ? <Hasil hasil={hasil} awalTerbuka={awalTerbuka} setAwalTerbuka={setAwalTerbuka} /> : (
        <View style={styles.hasilCard}>
          <Text style={styles.hasilLabel}>Estimasi cicilan per bulan</Text>
          <Text style={styles.hasilKosong}>Rp -</Text>
          <View style={styles.progressRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.progressPip, i < terisi && styles.progressPipIsi]} />
            ))}
          </View>
          <Text style={styles.progressText}>{terisi} dari 4 terisi</Text>
          <Text style={styles.hasilKosongHint}>Isi formulir untuk melihat estimasi kamu</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Donut({ porsi }) {
  const r = 52;
  const stroke = 22;
  const keliling = 2 * Math.PI * r;
  const potongan = [
    { nilai: porsi.pokok, warna: "#1d4ed8" },
    { nilai: porsi.bunga, warna: "#38bdf8" },
    { nilai: porsi.biaya, warna: "#93c5fd" },
  ];
  let jalan = 0;
  return (
    <Svg width={140} height={140}>
      {potongan.map((p, i) => {
        const panjang = (p.nilai / 100) * keliling;
        const el = (
          <Circle
            key={i}
            cx={70}
            cy={70}
            r={r}
            stroke={p.warna}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${panjang} ${keliling - panjang}`}
            strokeDashoffset={-jalan}
            // Mulai dari atas, bukan dari jam 3.
            transform="rotate(-90 70 70)"
          />
        );
        jalan += panjang;
        return el;
      })}
    </Svg>
  );
}

function BarCicilan({ jadwal }) {
  // Maksimal 25 batang supaya tetap kebaca di layar HP; tenor panjang
  // diambil sampelnya rata.
  const maks = 25;
  const langkah = Math.max(1, Math.ceil(jadwal.length / maks));
  const contoh = jadwal.filter((_, i) => i % langkah === 0).slice(0, maks);
  const tertinggi = Math.max(...contoh.map((c) => c.cicilan), 1);
  const lebar = 300;
  const tinggi = 110;
  const celah = 3;
  const lebarBatang = Math.max(2, lebar / contoh.length - celah);

  return (
    <Svg width={lebar} height={tinggi}>
      {contoh.map((c, i) => {
        const x = i * (lebarBatang + celah);
        const tinggiBatang = (c.cicilan / tertinggi) * tinggi;
        const tinggiPokok = (c.pokok / tertinggi) * tinggi;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={tinggi - tinggiBatang} width={lebarBatang} height={tinggiBatang - tinggiPokok} fill="#38bdf8" rx={2} />
            <Rect x={x} y={tinggi - tinggiPokok} width={lebarBatang} height={tinggiPokok} fill="#1d4ed8" rx={2} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function Hasil({ hasil, awalTerbuka, setAwalTerbuka }) {
  const satuTahun = hasil.jenis === TUNAI ? hasil.bungaPerBulan : null;
  return (
    <>
      <View style={styles.hasilCard}>
        <Text style={styles.hasilLabel}>Estimasi cicilan per bulan</Text>
        <Text style={styles.hasilAngka}>{formatCurrency(Math.round(hasil.cicilanPerBulan))}</Text>
        {!hasil.cicilanSeragam && (
          <Text style={styles.hasilCatatan}>Cicilan tahap pertama. Berubah waktu bunganya naik.</Text>
        )}
        {satuTahun !== null && hasil.pokok > 0 && (
          <Text style={styles.hasilCatatan}>
            Bunga {((hasil.bungaPerBulan / hasil.pokok) * 100).toFixed(2).replace(/\.?0+$/, "")}% per bulan,
            setara {((hasil.bungaPerBulan / hasil.pokok) * 1200).toFixed(2).replace(/\.?0+$/, "")}% per tahun
          </Text>
        )}

        {hasil.dibayarDiAwal > 0 && (
          <Pressable style={styles.awalBox} onPress={() => setAwalTerbuka((v) => !v)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.awalTitle}>Dibayar di awal</Text>
              <Text style={styles.awalSub}>Uang muka, cicilan pertama, dan biaya</Text>
            </View>
            <Text style={styles.awalAngka}>
              {formatCurrency(Math.round(hasil.dibayarDiAwal))} {awalTerbuka ? "▲" : "▼"}
            </Text>
          </Pressable>
        )}
        {awalTerbuka && hasil.dibayarDiAwal > 0 && (
          <View style={styles.awalRincian}>
            <RincianBaris label="Uang muka" nilai={hasil.uangMuka} />
            <RincianBaris label="Cicilan pertama" nilai={hasil.cicilanPerBulan} />
            {hasil.biaya.rincian.map((b) => (
              <RincianBaris key={b.label} label={b.label} nilai={b.nilai} />
            ))}
          </View>
        )}

        <Text style={styles.subTitle}>Rincian total pembayaran</Text>
        <RincianBaris label="Jumlah pinjaman" nilai={hasil.pokok} titik="#1d4ed8" />
        <RincianBaris label="Total bunga" nilai={hasil.totalBunga} titik="#38bdf8" />
        <RincianBaris label="Biaya dan beban" nilai={hasil.biaya.total} titik="#93c5fd" />
        <View style={styles.totalBaris}>
          <Text style={styles.totalLabel}>Total yang dibayar</Text>
          <Text style={styles.totalNilai}>{formatCurrency(Math.round(hasil.totalDibayar))}</Text>
        </View>
        <Text style={styles.disclaimer}>
          Cicilan sama setiap bulan dengan bunga flat yang dihitung dari pinjaman awal. Biaya dibayar di
          awal. Penawaran sebenarnya bisa berbeda.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Rincian pembayaran kamu</Text>
        <View style={styles.sectionRule} />

        <Text style={styles.blokTitle}>Total utang</Text>
        <View style={styles.donutRow}>
          <Donut porsi={hasil.porsi} />
          <View style={{ flex: 1 }}>
            <LegendaBaris warna="#1d4ed8" label="Pokok pinjaman" persen={hasil.porsi.pokok} />
            <LegendaBaris warna="#38bdf8" label="Bunga" persen={hasil.porsi.bunga} />
            <LegendaBaris warna="#93c5fd" label="Biaya dan beban" persen={hasil.porsi.biaya} />
          </View>
        </View>
        <Text style={styles.biayaUtang}>
          Biaya utang ini senilai{" "}
          <Text style={styles.biayaUtangTebal}>{Math.round(hasil.biayaUtangPersen)}%</Text> dari pinjaman kamu
        </Text>

        <Text style={styles.blokTitle}>Setiap cicilan bulanan</Text>
        <View style={styles.legendaBaris}>
          <View style={[styles.titik, { backgroundColor: "#1d4ed8" }]} />
          <Text style={styles.legendaLabel}>Pokok</Text>
          <View style={[styles.titik, { backgroundColor: "#38bdf8", marginLeft: 14 }]} />
          <Text style={styles.legendaLabel}>Bunga</Text>
        </View>
        <BarCicilan jadwal={hasil.jadwal} />
        <View style={styles.sumbuRow}>
          <Text style={styles.sumbuText}>Bulan 1</Text>
          <Text style={styles.sumbuText}>Bulan {hasil.months}</Text>
        </View>
        <Text style={styles.disclaimer}>
          Bunga dihitung dari pinjaman awal, jadi setiap cicilan terbagi dengan porsi yang sama.
        </Text>

        <View style={styles.cicilanTabel}>
          <View style={styles.cicilanHead}>
            <Text style={[styles.cicilanHeadText, { flex: 1 }]} />
            <Text style={styles.cicilanHeadText}>Pokok</Text>
            <Text style={styles.cicilanHeadText}>Bunga</Text>
          </View>
          <View style={styles.cicilanRow}>
            <Text style={[styles.cicilanLabel, { flex: 1 }]}>Setiap cicilan</Text>
            <View style={styles.cicilanKolom}>
              <Text style={styles.cicilanNilai}>{formatCurrency(Math.round(hasil.pokokPerBulan))}</Text>
              <Text style={styles.cicilanPersen}>
                {Math.round((hasil.pokokPerBulan / hasil.cicilanPerBulan) * 100)}%
              </Text>
            </View>
            <View style={styles.cicilanKolom}>
              <Text style={styles.cicilanNilai}>{formatCurrency(Math.round(hasil.bungaPerBulan))}</Text>
              <Text style={styles.cicilanPersen}>
                {Math.round((hasil.bungaPerBulan / hasil.cicilanPerBulan) * 100)}%
              </Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}

const RincianBaris = ({ label, nilai, titik }) => (
  <View style={styles.rincianBaris}>
    <View style={styles.rincianKiri}>
      {titik ? <View style={[styles.titik, { backgroundColor: titik }]} /> : null}
      <Text style={styles.rincianLabel}>{label}</Text>
    </View>
    <Text style={styles.rincianNilai}>{formatCurrency(Math.round(nilai))}</Text>
  </View>
);

const LegendaBaris = ({ warna, label, persen }) => (
  <View style={styles.legendaBaris}>
    <View style={[styles.titik, { backgroundColor: warna }]} />
    <Text style={[styles.legendaLabel, { flex: 1 }]}>{label}</Text>
    <Text style={styles.legendaPersen}>{persen.toFixed(1).replace(".", ",")}%</Text>
  </View>
);

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  backButtonText: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: -2 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900" },
  subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },

  jenisRow: { flexDirection: "row", gap: 8 },
  jenisCard: {
    flex: 1, alignItems: "center", paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: radius.md, backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.surfaceBorder,
  },
  jenisCardAktif: { borderColor: "#38bdf8", backgroundColor: "#0b4f78" },
  jenisIkon: { fontSize: 20 },
  jenisLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "800", marginTop: 4 },
  jenisLabelAktif: { color: "#ffffff" },
  jenisSub: { color: colors.textFaint, fontSize: 10, fontWeight: "600", textAlign: "center", marginTop: 1 },

  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: colors.surfaceBorder, gap: 10,
  },
  sectionTitle: { color: "#7dd3fc", fontSize: 18, fontWeight: "900" },
  sectionRule: { width: 44, height: 3, borderRadius: 2, backgroundColor: "#38bdf8", marginTop: -4 },

  field: { gap: 6 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    backgroundColor: colors.surfaceSolid, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 11,
    color: colors.text, fontSize: 14, fontWeight: "700",
  },
  inputKecil: {},
  inputSalah: { borderColor: colors.negative, backgroundColor: "rgba(251,113,133,0.08)" },
  salah: { color: colors.negative, fontSize: 11, fontWeight: "700" },
  info: { color: colors.textFaint, fontSize: 11, fontWeight: "600" },

  modeToggle: {
    flexDirection: "row", borderRadius: radius.sm, overflow: "hidden",
    borderWidth: 1, borderColor: colors.border,
  },
  modeButton: { paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.surfaceSolid },
  modeButtonAktif: { backgroundColor: "#1d4ed8" },
  modeText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  modeTextAktif: { color: "#ffffff" },

  asumsiHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12, marginTop: 4,
  },
  asumsiTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  asumsiHint: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  asumsiBody: { gap: 10 },
  reset: { color: "#7dd3fc", fontSize: 12, fontWeight: "800", textDecorationLine: "underline" },

  hasilCard: {
    backgroundColor: "#0b4f78", borderRadius: radius.lg, padding: 18,
    borderWidth: 1, borderColor: colors.surfaceBorder, gap: 8,
  },
  hasilLabel: { color: "#cbe7f8", fontSize: 14, fontWeight: "800" },
  hasilAngka: { color: "#ffffff", fontSize: 32, fontWeight: "900" },
  hasilKosong: { color: "#7aa0b8", fontSize: 32, fontWeight: "900" },
  hasilKosongHint: { color: "#cbe7f8", fontSize: 13, fontWeight: "800" },
  hasilCatatan: { color: "#7dd3fc", fontSize: 12, fontWeight: "700" },

  progressRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  progressPip: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
  progressPipIsi: { backgroundColor: "#38bdf8" },
  progressText: { color: "#9cbed4", fontSize: 11, fontWeight: "700" },

  awalBox: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6,
    backgroundColor: "#1d4ed8", borderRadius: radius.md, padding: 14,
  },
  awalTitle: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  awalSub: { color: "#dbeafe", fontSize: 11, fontWeight: "600" },
  awalAngka: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  awalRincian: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: radius.sm, padding: 12, gap: 6 },

  subTitle: { color: "#ffffff", fontSize: 14, fontWeight: "900", marginTop: 10 },
  rincianBaris: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.10)",
  },
  rincianKiri: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  rincianLabel: { color: "#cbe7f8", fontSize: 13, fontWeight: "700" },
  rincianNilai: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  titik: { width: 9, height: 9, borderRadius: 5 },
  totalBaris: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9 },
  totalLabel: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  totalNilai: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  disclaimer: { color: "#9cbed4", fontSize: 11, fontWeight: "600", lineHeight: 16 },

  blokTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 8 },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  legendaBaris: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  legendaLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  legendaPersen: { color: colors.text, fontSize: 13, fontWeight: "900" },
  biayaUtang: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginTop: 4 },
  biayaUtangTebal: { color: colors.text, fontWeight: "900" },

  sumbuRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  sumbuText: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },

  cicilanTabel: { marginTop: 6, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 8 },
  cicilanHead: { flexDirection: "row", justifyContent: "flex-end", gap: 24, paddingBottom: 6 },
  cicilanHeadText: { color: colors.textFaint, fontSize: 11, fontWeight: "800", width: 90, textAlign: "right" },
  cicilanRow: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  cicilanLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  cicilanKolom: { width: 90, alignItems: "flex-end" },
  cicilanNilai: { color: colors.text, fontSize: 14, fontWeight: "900" },
  cicilanPersen: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },
});
