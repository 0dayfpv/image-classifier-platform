<div align="center">

# 🧠 Görsel Sınıflandırıcı Stüdyosu (Image Classifier Studio)

**Tarayıcı Tabanlı, %100 İstemci Taraflı (Serverless) İnteraktif Görsel Sınıflandırma ve Transfer Öğrenme Platformu**

[![Canlı Demo](https://img.shields.io/badge/🚀_Canlı_Demo-ml.hamzafpv.com.tr-4F46E5?style=for-the-badge)](https://ml.hamzafpv.com.tr)
[![Geliştirici](https://img.shields.io/badge/🌐_Web-hamzafpv.com.tr-0F172A?style=for-the-badge)](https://hamzafpv.com.tr)

[![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js_4.22-FF6F00?style=flat-square&logo=tensorflow&logoColor=white)](https://www.tensorflow.org/js)
[![MobileNetV2](https://img.shields.io/badge/MobileNetV2-Transfer_Learning-10B981?style=flat-square)](https://github.com/tensorflow/tfjs-models/tree/master/mobilenet)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![IndexedDB](https://img.shields.io/badge/Storage-IndexedDB_(100%25_Local)-8B5CF6?style=flat-square)](#veri-kalıcılığı-ve-gizlilik)
[![Unit Tests](https://img.shields.io/badge/Vitest-111%2F111_Passed-22C55E?style=flat-square&logo=vitest&logoColor=white)](#test-ve-doğrulama)
[![E2E Tests](https://img.shields.io/badge/Playwright_E2E-70%2F70_Passed-2EAD33?style=flat-square&logo=playwright&logoColor=white)](#test-ve-doğrulama)
[![Dil Desteği](https://img.shields.io/badge/Dil-TR_%7C_EN-F59E0B?style=flat-square)](#özellikler)

</div>

---

## 📌 Proje Hakkında

**Görsel Sınıflandırıcı Stüdyosu**, [Machine Learning for Kids](https://machinelearningforkids.co.uk/) üzerindeki *"Recognising Images"* deneyiminden ilham alınarak geliştirilmiş; hiçbir harici sunucu (backend), veritabanı veya API anahtarı gerektirmeden **tamamen kullanıcının web tarayıcısında (WebGL hızlandırmalı)** çalışan modern bir makine öğrenmesi eğitim ve prototipleme platformudur.

Kullanıcılar kendi görsel veri setlerini kameradan, dosyadan veya çizim tuvalinden toplayabilir, **TensorFlow.js + MobileNetV2 Transfer Learning** ile saniyeler içinde tarayıcıda modellerini eğitebilir, gerçek zamanlı **Loss & Accuracy** grafiklerini izleyebilir ve eğittikleri modeli tek tıkla (`model.json` + `model.weights.bin` + hazır HTML/JS kodu) dışa aktarabilirler.

---

## ✨ Temel Özellikler (3 Aşamalı İş Akışı)

### 🗂️ Proje Paneli (Dashboard) ve Çoklu Dil (`TR / EN`)
- Birden fazla görsel sınıflandırma projesi oluşturma, açma ve silme.
- Her proje kartında etiket sayısı, toplam örnek sayısı ve model eğitim durumu özeti.
- Üst menüden anlık **Türkçe (`TR`) / İngilizce (`EN`)** dil geçişi.

### 1️⃣ Aşama 1: Eğit (`1. Train` — Veri Toplama)
- **`+ Yeni Etiket Ekle`** ile sınırsız sınıf kutusu (bucket) oluşturma, yeniden adlandırma ve silme.
- Her sınıfa **3 farklı kaynaktan** görsel ekleyebilme:
  1. 📷 **Web Kamerası:** Tekli fotoğraf çekimi ve basılı tutarak seri çekim (**Burst Mode**).
  2. 📁 **Dosya Yükleme / Sürükle-Bırak:** Bilgisayardan çoklu `JPG`, `PNG` ve `WebP` görselleri yükleme (`<= 320px` otomatik normalizasyon).
  3. 🎨 **Çizim Pad'i (Drawing Pad):** Fare ile şekil çizip (fırça boyutu, renk, silgi desteğiyle) doğrudan eğitim örneği olarak ekleme.
- Sınıf başına örnek sayacı, küçük önizleme (thumbnail) ızgarası, tekil örnek silme, **düşük örnek uyarısı (`< 5` görsel)** ve **dengesiz veri seti uyarısı**.

### 2️⃣ Aşama 2: Öğren ve Test Et (`2. Learn & Test` — Eğitim ve Canlı Tahmin)
- **Veri Seti Hazırlık Özeti:** Toplam sınıf ve örnek sayısı kontrolü, eksik/değişen veri seti durumunda yeniden eğitim uyarısı.
- **Gelişmiş Ayarlar Paneli:** `Epoch Sayısı` (varsayılan: `20`), `Batch Boyutu` (varsayılan: `16`) ve `Öğrenme Oranı / Learning Rate` (varsayılan: `0.001`) yapılandırması.
- **Canlı Telemetri Grafikleri:** Eğitim sırasında canlı ilerleme çubuğu, eğitimi durdurma (`AbortController`) ve gerçek zamanlı **Eğitim Kaybı (Loss)** & **Doğruluk (Accuracy)** SVG grafikleri.
- **Canlı Test Alanı:** Eğitilen modeli **Canlı Kamera**, **Dosya Yükleme** veya **Çizim Pad'i** ile test etme ve tüm sınıflar için gerçek zamanlı güven oranlarını (**`% confidence`**) yatay çubuk grafik olarak izleme.

### 3️⃣ Aşama 3: Üret (`3. Make` — Etkileşimli Alan ve Modeli Dışa Aktarma)
- **Canlı Etkileşim Alanı (Mini Playground):** Eğitilen her sınıfa özel **ekran mesajı**, **arka plan/vurgu rengi**, **Web Audio ses efekti** (`Çan / Chime`, `Bip / Beep`, `Başarı / Success`, `Uyarı / Alert`, `Pıt / Pop`) ve **sayaç artırma** tepkisi tanımlama; tetikleme eşiği (`%`) belirleyip canlı kamerayla gerçek zamanlı kontrolcü olarak kullanma.
- **TensorFlow.js Model Dışa Aktarma:**
  - Tek tıkla `model.json` ve `model.weights.bin` dosyalarını indirme.
  - Sınıflarınıza özel üretilen, **Canlı Kamera** ve **Görsel Seçme** destekli bağımsız HTML/JS örnek kodunu tek tıkla kopyalama (`http://` ve doğrudan çift tıklamalı `file://` modlarıyla uyumlu).

---

## 🔒 Veri Kalıcılığı ve Gizlilik

- **%100 Yerel Depolama (`IndexedDB`):** Yüklenen veya kamerayla çekilen hiçbir fotoğraf sunucuya gönderilmez. Tüm projeler, etiketler, görseller ve eğitilen model ağırlıkları kullanıcının kendi tarayıcısındaki `image-classifier-platform-db` IndexedDB veritabanında saklanır.
- **WebGL Bellek Hijyeni:** Tüm öznitelik çıkarımı, eğitim ve tahmin adımlarında TensorFlow.js tensörleri `tf.tidy()` ve `tensor.dispose()` ile temizlenir; GPU/WebGL bellek sızıntısı oluşmaz.

---

## 🏗️ Mimari ve Klasör Yapısı

```text
image_classifier_platform/
├── public/
│   └── models/
│       └── mobilenet_v2_1.0_224/    # Yerel barındırılan MobileNetV2 (model.json + 4 ağırlık parçası)
├── src/
│   ├── types/                       # Domain, ML ve i18n TypeScript tip sözleşmeleri
│   ├── i18n/                        # TR / EN dil sözlükleri ve I18nProvider
│   ├── storage/                     # IndexedDB şeması (db.ts) ve atomik CRUD (projectRepository.ts)
│   ├── media/                       # Görsel normalizasyon, kamera servisi ve Web Audio ses sentezleyici
│   ├── ml/                          # WebGL/CPU backend, MobileNetV2 yükleyici, TransferClassifier, Exporter
│   ├── hooks/                       # React durum ve eğitim oturumu hook'ları
│   └── components/                  # Dashboard, 1. Eğit, 2. Öğren ve Test Et, 3. Üret arayüz bileşenleri
├── tests/
│   └── unit/                        # 10 test dosyası / 111 Vitest birim testi
└── e2e/                             # 4 katmanlı / 70 senaryoluk Playwright tarayıcı E2E test paketi
```

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Node.js** `>= 20` ve **npm**

### Yerel Geliştirme Sunucusu

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme sunucusunu başlatın (http://localhost:5173)
npm run dev
```

### Üretim Derlemesi (Production Build)

```bash
# TypeScript tip kontrolü + Vite üretim derlemesi (dist/)
npm run build

# Üretim derlemesini yerel olarak önizleyin (http://127.0.0.1:4173)
npm run preview
```

---

## 🧪 Test ve Doğrulama

```bash
# ESLint statik kod analizi
npm run lint

# Vitest birim testleri (111 birim testi)
npm test

# Playwright uçtan uca tarayıcı testleri (70 E2E testi — sıfır konsol hatası doğrulamalı)
npm run test:e2e
```

---

<div align="center">

© 2025–2026 [hamzafpv.com.tr](https://hamzafpv.com.tr) • Tüm hakları saklıdır.

</div>
