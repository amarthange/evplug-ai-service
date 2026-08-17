import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
interface EVProfile {
  vehicleMakeModel: string;
  vehicleRegistrationNumber: string;
  preferredConnectorType: "CCS" | "CHAdeMO" | "Type 2" | "Tesla Supercharger";
  batteryCapacityKWh?: number;
  preferredChargingPowerKW?: number;
  defaultPaymentMethod?: "card" | "upi" | "wallet";
}

interface ProfileFormProps {
  onSubmit: (profile: EVProfile) => void;
  isLoading?: boolean;
}

export default function ProfileForm({ onSubmit, isLoading = false }: ProfileFormProps) {
  const [formData, setFormData] = useState<EVProfile>({
    vehicleMakeModel: "",
    vehicleRegistrationNumber: "",
    preferredConnectorType: "CCS",
    batteryCapacityKWh: 0,
    preferredChargingPowerKW: 0,
    defaultPaymentMethod: "card",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.vehicleMakeModel.trim()) {
      newErrors.vehicleMakeModel = "Vehicle make/model is required";
    }
    if (!formData.vehicleRegistrationNumber.trim()) {
      newErrors.vehicleRegistrationNumber = "Registration number is required";
    }
    if (!formData.preferredConnectorType) {
      newErrors.preferredConnectorType = "Connector type is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const handleChange = (field: keyof EVProfile, value: string | number | undefined) => {
    setFormData((prev: EVProfile) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev: Record<string, string>) => ({
        ...prev,
        [field]: "",
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Vehicle Make/Model */}
      <div>
        <Label htmlFor="make">Vehicle Make & Model *</Label>
        <Input
          id="make"
          placeholder="e.g., Tesla Model 3, Hyundai Creta EV"
          value={formData.vehicleMakeModel}
          onChange={(e) => handleChange("vehicleMakeModel", e.target.value)}
          disabled={isLoading}
          data-testid="input-vehicle-make"
          className={errors.vehicleMakeModel ? "border-destructive" : ""}
        />
        {errors.vehicleMakeModel && (
          <p className="text-xs text-destructive mt-1">{errors.vehicleMakeModel}</p>
        )}
      </div>

      {/* Registration Number */}
      <div>
        <Label htmlFor="registration">Registration Number *</Label>
        <Input
          id="registration"
          placeholder="e.g., MH02AB1234"
          value={formData.vehicleRegistrationNumber}
          onChange={(e) => handleChange("vehicleRegistrationNumber", e.target.value.toUpperCase())}
          disabled={isLoading}
          data-testid="input-registration"
          className={errors.vehicleRegistrationNumber ? "border-destructive" : ""}
        />
        {errors.vehicleRegistrationNumber && (
          <p className="text-xs text-destructive mt-1">{errors.vehicleRegistrationNumber}</p>
        )}
      </div>

      {/* Preferred Connector */}
      <div>
        <Label htmlFor="connector">Preferred Connector Type *</Label>
        <Select
          value={formData.preferredConnectorType}
          onValueChange={(value) => handleChange("preferredConnectorType", value)}
        >
          <SelectTrigger
            id="connector"
            disabled={isLoading}
            data-testid="select-connector"
            className={errors.preferredConnectorType ? "border-destructive" : ""}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CCS">CCS (Combined Charging System)</SelectItem>
            <SelectItem value="CHAdeMO">CHAdeMO</SelectItem>
            <SelectItem value="Type 2">Type 2</SelectItem>
            <SelectItem value="Tesla Supercharger">Tesla Supercharger</SelectItem>
          </SelectContent>
        </Select>
        {errors.preferredConnectorType && (
          <p className="text-xs text-destructive mt-1">{errors.preferredConnectorType}</p>
        )}
      </div>

      {/* Battery Capacity */}
      <div>
        <Label htmlFor="battery">Battery Capacity (kWh) - Optional</Label>
        <Input
          id="battery"
          type="number"
          placeholder="e.g., 60"
          value={formData.batteryCapacityKWh || ""}
          onChange={(e) => handleChange("batteryCapacityKWh", e.target.value ? parseInt(e.target.value) : 0)}
          disabled={isLoading}
          data-testid="input-battery"
        />
      </div>

      {/* Preferred Charging Power */}
      <div>
        <Label htmlFor="power">Preferred Charging Power (kW) - Optional</Label>
        <Input
          id="power"
          type="number"
          placeholder="e.g., 150"
          value={formData.preferredChargingPowerKW || ""}
          onChange={(e) => handleChange("preferredChargingPowerKW", e.target.value ? parseInt(e.target.value) : 0)}
          disabled={isLoading}
          data-testid="input-power"
        />
      </div>

      {/* Payment Method */}
      <div>
        <Label htmlFor="payment">Default Payment Method - Optional</Label>
        <Select
          value={formData.defaultPaymentMethod}
          onValueChange={(value) => handleChange("defaultPaymentMethod", value)}
        >
          <SelectTrigger
            id="payment"
            disabled={isLoading}
            data-testid="select-payment"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="card">Credit/Debit Card</SelectItem>
            <SelectItem value="upi">UPI</SelectItem>
            <SelectItem value="wallet">Digital Wallet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full h-12"
        disabled={isLoading}
        data-testid="button-save-profile"
      >
        {isLoading ? "Saving..." : "Complete Profile & Continue"}
      </Button>
    </form>
  );
}
