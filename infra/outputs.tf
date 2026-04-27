data "oci_core_vnic_attachments" "openclaw" {
  compartment_id = var.compartment_ocid
  instance_id    = oci_core_instance.openclaw.id
}

data "oci_core_vnic" "openclaw" {
  vnic_id = data.oci_core_vnic_attachments.openclaw.vnic_attachments[0].vnic_id
}

output "instance_id" {
  value = oci_core_instance.openclaw.id
}

output "public_ip" {
  value = data.oci_core_vnic.openclaw.public_ip_address
}

output "ssh_command" {
  value = "ssh ubuntu@${data.oci_core_vnic.openclaw.public_ip_address}"
}
