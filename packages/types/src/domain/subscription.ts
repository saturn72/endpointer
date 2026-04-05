export type SubscriptionStatus = 'pending' | 'approved' | 'rejected';

export interface Subscription {
  id: string;
  subscriberId: string;
  endpointId: string;
  status: SubscriptionStatus;
  createdAt: Date;
  updatedAt: Date;
}