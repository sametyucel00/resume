import { Platform } from "react-native";
import { useAppStore } from "../store/useAppStore";

export type ProductId = "credits_25" | "credits_100";

export const productIds: ProductId[] = ["credits_25", "credits_100"];

export const creditProducts: Record<ProductId, { label: string; credits: number; description: string }> = {
  credits_25: { label: "25 Credits", credits: 25, description: "Quick CV optimization pack" },
  credits_100: { label: "100 Credits", credits: 100, description: "Job application power pack" }
};

const productCredits: Record<ProductId, number> = {
  credits_25: 25,
  credits_100: 100
};

export async function purchaseCredits(productId: ProductId) {
  const language = useAppStore.getState().settings.language;
  const credits = productCredits[productId];

  if (Platform.OS === "web") {
    return {
      ok: false,
      credits: 0,
      message:
        language === "tr"
          ? "Kredi satın alma App Store ve Google Play üzerinden mobil uygulamada yapılır."
          : "Credit purchases are available in the mobile app through the App Store and Google Play."
    };
  }

  try {
    const iap = require("react-native-iap");
    await iap.initConnection();
    await iap.requestPurchase({ sku: productId });
    return {
      ok: true,
      credits,
      message: language === "tr" ? `${credits} kredi hesabına eklendi.` : `${credits} credits added to your balance.`
    };
  } catch {
    return {
      ok: false,
      credits: 0,
      message:
        language === "tr"
          ? "Satın alma tamamlanamadı. Lütfen mağaza hesabınızı ve bağlantınızı kontrol edip tekrar deneyin."
          : "Purchase could not be completed. Check your store account and connection, then try again."
    };
  }
}

export async function restorePurchases() {
  const language = useAppStore.getState().settings.language;
  if (Platform.OS === "web") {
    return {
      ok: false,
      credits: 0,
      message: language === "tr" ? "Satın almaları geri yükleme mobil uygulamada kullanılabilir." : "Restore purchases is available in the mobile app."
    };
  }

  try {
    const iap = require("react-native-iap");
    await iap.initConnection();
    const purchases = await iap.getAvailablePurchases();
    const credits = purchases.reduce((total: number, item: { productId?: ProductId }) => {
      if (!item.productId) return total;
      return total + (productCredits[item.productId] ?? 0);
    }, 0);
    return {
      ok: true,
      credits,
      message:
        credits > 0
          ? language === "tr"
            ? `Satın almaların geri yüklendi. ${credits} kredi kullanılabilir.`
            : `Purchases restored. ${credits} credits are available.`
          : language === "tr"
            ? "Geri yüklenecek satın alma bulunamadı."
            : "No purchases were found to restore."
    };
  } catch {
    return {
      ok: false,
      credits: 0,
      message:
        language === "tr"
          ? "Satın almalar geri yüklenemedi. Lütfen mağaza hesabınızı kontrol edip tekrar deneyin."
          : "Purchases could not be restored. Check your store account, then try again."
    };
  }
}
