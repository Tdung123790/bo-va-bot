export const VND_PER_EARN_POINT=1000;
export const VND_PER_REDEEM_POINT=10;

export function earnedPoints(subtotal,discountAmount=0,pointsDiscountAmount=0){
 const net=Math.max(0,Number(subtotal||0)-Number(discountAmount||0)-Number(pointsDiscountAmount||0));
 return Math.floor(net/VND_PER_EARN_POINT);
}

export function maxRedeemPoints(eligibleMerchandise,availablePoints){
 const eligible=Math.max(0,Number(eligibleMerchandise||0));
 const available=Math.max(0,Math.floor(Number(availablePoints||0)));
 return Math.min(available,Math.floor(eligible/50));
}
