# Droplio

3D casual puzzle/arcade oyunu — **React Native (Expo SDK 58) + three.js**, alətlər isə **Python** ilə.

Düşən rəngli 3D topları eyni rəngli bölməyə (qırmızı / mavi / sarı) yığırsan. Səbəti bir barmaqla sağa-sola sürüşdürürsən.

## Expo Go ilə işə salmaq

```bash
npm install
npx expo start
```

Telefonda **Expo Go** (SDK 58) ilə QR kodu oxut.

> **Node.js 22.13+ lazımdır.** Expo SDK 58 və React Native 0.88 rəsmi olaraq Node ≥ 22.13 tələb edir. Node 20-də də quraşdırma və bundle işləyir, amma xəbərdarlıqlar çıxır. `nvm install 22` tövsiyə olunur.

## Python harada istifadə olunur?

Expo Go telefonda yalnız JavaScript işlədir, ona görə Python oyunun **dizayn və istehsal alətləri** üçündür:

| Skript | Nə edir |
|---|---|
| `tools/generate_levels.py` | 300 səviyyəni (10 dünya) deterministik yaradır və **hər birinin keçilə bilən olduğunu riyazi yoxlayır** (insan sürəti + reaksiya modeli, bombalardan yayınma). Nəticə: `src/data/levels.json` |
| `tools/generate_logo.py` | Loqonu (`assets/logo.png`), tətbiq ikonunu, Android ikonlarını, splash və favicon-u çəkir (yalnız standart kitabxana) |
| `tools/generate_audio.py` | Bütün səs effektlərini və fon musiqisini sıfırdan sintez edir (yalnız standart kitabxana). Nəticə: `assets/sounds/*.wav` |

```bash
npm run levels        # səviyyələri yenidən yarat + yoxla
npm run levels:check  # yalnız yoxla
npm run audio         # səsləri yenidən yarat
npm run logo          # loqo və ikonları yenidən yarat
npm run playtest      # bot real fizika mühərrikində 300 səviyyəni oynayır
npm run typecheck
```

Səviyyələri dəyişmək üçün `levels.json`-u əllə redaktə etmə — `tools/generate_levels.py` içindəki `spec_for()` çətinlik əyrisini dəyiş və skripti yenidən işlət.

## Struktur

```
App.tsx                       ekranlar arası keçid
src/
  data/       levels.ts (+levels.json), cosmetics.ts (skinlər)
  game/
    GameEngine.ts             oyun məntiqi + 2D fizika (render-dən asılı deyil)
    three/                    GameRenderer, HomeScene, hissəciklər, matcap teksturalar
  managers/   SaveManager, AudioManager, AdManager (+ads/), RewardManager, Haptics
  screens/    Home, LevelSelect, Game, Collection
  components/ UI dəsti, Settings, SimulatedAdOverlay
  config/ads.ts               AdMob ID-ləri və reklam qaydaları
tools/        Python generatorları + bot playtest
```

## Oyun mexanikaları

- **Dünya 1 (1–30)**: əsaslar. 1–10 yalnız əsas oyun; 11+ qızıl toplar, 18+ yavaş toplar, 25+ göy qurşağı toplar.
- **Dünya 2 (31–60)**: bombalar, 45+ "speed rush" anları.
- **Dünya 3 (61–90)**: yellənən bombalar, 71+ cüt düşmələr.
- **Dünya 4 (91–120)**: üçlü düşmələr.
- **Dünya 5 Pro (121–150)**: hamısı birlikdə, daha uzun səviyyələr (4 can).
- **Dünya 6 Bomb Zone (151–180)**: çox bomba, yellənən bombalar.
- **Dünya 7 Combo (181–210)**: çox cüt və üçlü düşmə.
- **Dünya 8 Rush (211–240)**: tez-tez sürət artımları.
- **Dünya 9 Legend (241–270)**: çox yavaş və qızıl top, yüksək sürət.
- **Dünya 10 Grandmaster (271–300)**: bütün mövzular birlikdə, ən yüksək sürət.
- Ulduzlar: 3★ səhvsiz, 2★ ≤1 səhv, 1★ keçid. Hər səviyyədə əlavə bonus məqsədi var.
- Toplar düşmədən əvvəl yuxarıda rəngli işıqla xəbərdarlıq edilir (ədalətli oxunaqlıq).

## Yaddaş

`AsyncStorage`-da versiyalı save (`SAVE_VERSION`). Hər sahə ayrıca yoxlanılır; zədələnmiş məlumat oyunu çökdürmür, standart dəyərlərə qayıdır.

## AdMob — vacib qeyd

- **Expo Go-da real AdMob işləyə bilməz** (Google Mobile Ads SDK native moduldur, Expo Go-da yoxdur). Ona görə Expo Go-da açıq şəkildə **"SIMULATED TEST AD"** yazılmış ekran göstərilir — mükafatlı reklam axınını (bax → mükafat al, keç → mükafat yox) və interstitial qaydalarını yoxlamaq üçün. Heç bir şəbəkəyə sorğu getmir.
- Native build-də (`eas build` və ya `npx expo run:ios`) `react-native-google-mobile-ads` ilə **real** inteqrasiya işləyir: UMP razılıq axını (`AdsConsent.gatherConsent`), mükafatlı və interstitial reklamlar, təkrar sorğuların qarşısının alınması, uğursuzluqda backoff.
- İnkişaf zamanı Google-un rəsmi **test** ID-ləri istifadə olunur.

### Real ID-ləri hara yazmaq

1. `app.json` → `react-native-google-mobile-ads` plugin → `iosAppId` / `androidAppId` (indi Google-un nümunə app ID-ləridir).
2. `src/config/ads.ts` → `PRODUCTION_AD_UNITS`.
3. Release üçün `USE_PRODUCTION_ADS = true`.

### Reklam qaydaları (`AD_POLICY`)

- **Interstitial**: yalnız səviyyə **bitdikdən sonra** (qələbə və ya məğlubiyyət ekranında Continue / Retry / Home / Levels basanda), **hər 3 bitmiş səviyyədən bir**. Oyun zamanı və pauza menyusundan heç vaxt.
- İlk 3 səviyyədə yoxdur.
- **Rewarded** (həmişə könüllü): uduzanda **+1 Life** (ikinci şans), pauzada **+1 Life** (əlavə həyat, cəhd başına 1 dəfə), qələbədə **Double coins** (bonus).
- İki reklam arası minimum 90 saniyə; tətbiq açılandan sonra ilk 60 saniyədə yoxdur. Rəqəmlər `src/config/ads.ts` → `AD_POLICY`-dədir.
- Banner və App Open reklamları yoxdur.
- Mükafatlı reklam həmişə könüllüdür; mükafat yalnız `EARNED_REWARD` təsdiqindən sonra verilir. Reklam yoxdursa düymə görünmür, oyun normal davam edir.
- ATT: oyun özü IDFA icazəsi istəmir. Lazım olsa, AdMob konsolunda IDFA mesajını aktiv edin və plugin konfiqinə `userTrackingUsageDescription` əlavə edin.

## iOS build (lokal Xcode, EAS istifadə etmədən)

```bash
nvm use 22                                   # SDK 58 Node 22 tələb edir
npx expo prebuild --platform ios --clean     # ios/ qovluğunu yaradır + pod install
echo "export NODE_BINARY=$(which node)" > ios/.xcode.env.local
open ios/Droplio.xcworkspace                  # Product → Archive → Distribute App → App Store Connect
```

- Team ID: `487J3W7W6Q`, Bundle ID: `com.droplio.game` (`app.json`-da).
- Hər yeni TestFlight yükləməsindən əvvəl `app.json` → `ios.buildNumber`-i artırın və `prebuild`-i yenidən işlədin.
- `patches/expo-modules-jsi+58.0.23.patch`: Xcode 26 (Swift 6.2) ilə `ExpoModulesJSI` build xətasını düzəldir; `npm install`-dan sonra `patch-package` onu avtomatik tətbiq edir.
