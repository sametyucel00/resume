import { Platform } from "react-native";
import { useAppStore } from "../store/useAppStore";

export type ProductId = "credits_25" | "credits_100";

export const creditProducts: Record<ProductId, { label: string; credits: number; description: string }> = {
  credits_25: { label: "25 credits", credits: 25, description: "Light optimization pack" },
  credits_100: { label: "100 credits", credits: 100, description: "Application sprint pack" }
};

const productCredits: Record<ProductId, number> = {
  credits_25: 25,
  credits_100: 100
};

export async function purchaseCredits(productId: ProductId) {
  const language = useAppStore.getState().settings.language;
  if (Platform.OS === "web") {
    return {
      ok: true,
      credits: productCredits[productId],
      message: language === "tr" ? "Demo kredi eklendi. Gerçek mağaza faturalaması iOS ve Android build'lerinde çalışır." : "Demo credits added. Native store billing runs in iOS and Android builds."
    };
  }

  try {
    const iap = require("react-native-iap");
    await iap.initConnection();
    await iap.requestPurchase({ sku: productId });
    return { ok: true, credits: productCredits[productId], message: language === "tr" ? "Satın alma tamamlandı." : "Purchase completed." };
  } catch {
    return { ok: false, credits: 0, message: language === "tr" ? "Mağaza faturalaması bu önizlemede kullanılamıyor." : "Store billing is not available in this preview." };
  }
}

export async function restorePurchases() {
  const language = useAppStore.getState().settings.language;
  if (Platform.OS === "web") return { ok: false, credits: 0, message: language === "tr" ? "Geri yükleme yalnızca mobil mağaza build'lerinde kullanılabilir." : "Restore is only available in mobile store builds." };

  try {
    const iap = require("react-native-iap");
    await iap.initConnection();
    const purchases = await iap.getAvailablePurchases();
    const credits = purchases.reduce((total: number, item: { productId?: ProductId }) => {
      if (!item.productId) return total;
      return total + (productCredits[item.productId] ?? 0);
    }, 0);
    return { ok: true, credits, message: credits > 0 ? (language === "tr" ? "Satın almalar geri yüklendi." : "Purchases restored.") : (language === "tr" ? "Satın alma bulunamadı." : "No purchases found.") };
  } catch {
    return { ok: false, credits: 0, message: language === "tr" ? "Geri yükleme bu önizlemede kullanılamıyor." : "Restore is not available in this preview." };
  }
}
