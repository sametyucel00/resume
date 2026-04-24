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

type IapPurchase = {
  productId?: string;
  transactionId?: string;
  purchaseToken?: string;
};

function isProductId(value: string | undefined): value is ProductId {
  return value === "credits_25" || value === "credits_100";
}

function getPurchaseMessage(language: "tr" | "en", credits: number) {
  return language === "tr" ? `${credits} kredi hesabına eklendi.` : `${credits} credits added to your balance.`;
}

function getStoreUnavailableMessage(language: "tr" | "en") {
  return language === "tr"
    ? "Kredi paketleri şu anda App Store tarafından kullanılamıyor. Lütfen daha sonra tekrar deneyin."
    : "Credit packs are currently unavailable from the App Store. Please try again later.";
}

function getPurchaseErrorMessage(language: "tr" | "en", error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code === "E_USER_CANCELLED" || code === "USER_CANCELLED") {
    return language === "tr" ? "Satın alma iptal edildi." : "Purchase was cancelled.";
  }
  return language === "tr"
    ? "Satın alma tamamlanamadı. Lütfen App Store hesabınızı ve bağlantınızı kontrol edip tekrar deneyin."
    : "Purchase could not be completed. Check your App Store account and connection, then try again.";
}

async function finishIfNeeded(iap: any, purchase: IapPurchase | IapPurchase[] | undefined, isConsumable = true) {
  const firstPurchase = Array.isArray(purchase) ? purchase[0] : purchase;
  if (!firstPurchase || typeof iap.finishTransaction !== "function") return;
  await iap.finishTransaction({ purchase: firstPurchase, isConsumable });
}

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

    if (Platform.OS === "ios" && typeof iap.clearTransactionIOS === "function") {
      await iap.clearTransactionIOS();
    }

    const products = await iap.getProducts({ skus: productIds });
    const product = Array.isArray(products) ? products.find((item) => item.productId === productId) : undefined;
    if (!product) {
      return {
        ok: false,
        credits: 0,
        message: getStoreUnavailableMessage(language)
      };
    }

    const purchase = await iap.requestPurchase(
      Platform.OS === "ios"
        ? { sku: productId, andDangerouslyFinishTransactionAutomaticallyIOS: false }
        : { skus: [productId] }
    );
    await finishIfNeeded(iap, purchase, true);

    return {
      ok: true,
      credits,
      message: getPurchaseMessage(language, credits)
    };
  } catch (error) {
    return {
      ok: false,
      credits: 0,
      message: getPurchaseErrorMessage(language, error)
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
    const credits = purchases.reduce((total: number, item: { productId?: string }) => {
      if (!isProductId(item.productId)) return total;
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
