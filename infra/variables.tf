variable "tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID"
  type        = string
}

variable "fingerprint" {
  description = "API key fingerprint"
  type        = string
}

variable "private_key_path" {
  description = "Path to the OCI API private key"
  type        = string
}

variable "region" {
  description = "OCI region"
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment OCID for the instance"
  type        = string
}

variable "availability_domain" {
  description = "Availability domain name. Leave null to use the first AD."
  type        = string
  default     = null
}

variable "ssh_public_key" {
  description = "SSH public key content used for the VM"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH to the VM"
  type        = string
  default     = "0.0.0.0/0"
}

variable "allow_tailscale_udp" {
  description = "Whether to open UDP 41641 for Tailscale direct connections"
  type        = bool
  default     = false
}

variable "instance_display_name" {
  description = "Display name for the VM"
  type        = string
  default     = "openclaw-a1"
}

variable "vcn_cidr" {
  description = "CIDR block for the VCN"
  type        = string
  default     = "10.42.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.42.1.0/24"
}

variable "shape" {
  description = "OCI compute shape"
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  description = "Number of OCPUs for the ARM instance"
  type        = number
  default     = 4
}

variable "memory_in_gbs" {
  description = "Memory in GB for the ARM instance"
  type        = number
  default     = 24
}

variable "boot_volume_size_in_gbs" {
  description = "Boot volume size"
  type        = number
  default     = 200
}
