import TripForm from '../components/TripForm';
import type { TripPlan } from '../types';

interface Props {
  onPlanned: (plan: TripPlan) => void;
}

export default function TripFormPage({ onPlanned }: Props) {
  return <TripForm onPlanned={onPlanned} />;
}
