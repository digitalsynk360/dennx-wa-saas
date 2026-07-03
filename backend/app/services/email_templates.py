"""
Responsive HTML email templates.
All templates use inline CSS for maximum email client compatibility.
"""

# Shared base styles
_BASE = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Logo / Header -->
  <tr>
    <td style="padding:0 0 24px 0;text-align:center;">
      <div style="display:inline-block;background:#000;border-radius:12px;padding:12px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">⚡ Deenx AI</span>
      </div>
    </td>
  </tr>

  <!-- Card -->
  <tr>
    <td style="background:#ffffff;border-radius:16px;padding:40px;border:1px solid #e4e4e7;">
      {content}
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:24px 0;text-align:center;color:#71717a;font-size:13px;line-height:1.6;">
      <p style="margin:0 0 4px 0;">Deenx AI · WhatsApp Business Automation</p>
      <p style="margin:0;color:#a1a1aa;font-size:12px;">If you didn't request this email, you can safely ignore it.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>
"""

_BTN = '<a href="{url}" style="display:inline-block;background:{color};color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;margin:24px 0;">{label}</a>'

_DIVIDER = '<hr style="border:none;border-top:1px solid #f0f0f0;margin:28px 0;">'

def _h1(text):
    return f'<h1 style="margin:0 0 8px 0;font-size:26px;font-weight:700;color:#09090b;letter-spacing:-0.5px;">{text}</h1>'

def _p(text, muted=False):
    color = "#71717a" if muted else "#3f3f46"
    return f'<p style="margin:12px 0;font-size:15px;line-height:1.7;color:{color};">{text}</p>'

def _badge(text, color="#18181b", bg="#f4f4f5"):
    return f'<span style="display:inline-block;background:{bg};color:{color};font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;margin-bottom:16px;">{text}</span>'

def _info_row(label, value):
    return f"""
    <tr>
      <td style="padding:10px 0;font-size:14px;color:#71717a;border-bottom:1px solid #f4f4f5;">{label}</td>
      <td style="padding:10px 0;font-size:14px;color:#09090b;font-weight:500;text-align:right;border-bottom:1px solid #f4f4f5;">{value}</td>
    </tr>"""


class EmailTemplates:

    @staticmethod
    def welcome(full_name: str, app_url: str) -> str:
        content = f"""
        {_badge("Welcome aboard! 🎉", "#15803d", "#dcfce7")}
        {_h1(f"Hi {full_name}, welcome to Deenx AI!")}
        {_p("Your account is ready. You can now connect your WhatsApp Business account and start automating your conversations.")}
        {_divider_section([
            ("🤖", "Flow Builder", "Create automated conversation flows with 56+ node types"),
            ("📥", "Smart Inbox", "Manage all your WhatsApp conversations in one place"),
            ("📢", "Campaigns", "Send broadcast messages to your contacts at scale"),
        ])}
        <div style="text-align:center;">
          {_BTN.format(url=app_url+"/settings", color="#18181b", label="Connect WhatsApp →")}
        </div>
        {_p("Need help? Reply to this email anytime.", muted=True)}
        """
        return _BASE.format(title="Welcome to Deenx AI", content=content)

    @staticmethod
    def verify_email(full_name: str, verify_url: str) -> str:
        content = f"""
        {_badge("Action required", "#1d4ed8", "#dbeafe")}
        {_h1("Verify your email address")}
        {_p(f"Hi {full_name}, thanks for signing up! Please verify your email address to activate your account.")}
        <div style="text-align:center;margin:32px 0;">
          {_BTN.format(url=verify_url, color="#1d4ed8", label="Verify Email Address")}
        </div>
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-top:8px;">
          <p style="margin:0;font-size:13px;color:#71717a;">Button not working? Copy and paste this link into your browser:</p>
          <p style="margin:8px 0 0 0;font-size:12px;color:#1d4ed8;word-break:break-all;">{verify_url}</p>
        </div>
        {_p("This link expires in <strong>24 hours</strong>.", muted=True)}
        """
        return _BASE.format(title="Verify your email", content=content)

    @staticmethod
    def forgot_password(full_name: str, reset_url: str) -> str:
        content = f"""
        {_badge("Password reset", "#c2410c", "#fff7ed")}
        {_h1("Reset your password")}
        {_p(f"Hi {full_name}, we received a request to reset your password. Click the button below to create a new one.")}
        <div style="text-align:center;margin:32px 0;">
          {_BTN.format(url=reset_url, color="#ea580c", label="Reset Password")}
        </div>
        <div style="background:#fef9c3;border-radius:10px;padding:16px;border-left:4px solid #eab308;">
          <p style="margin:0;font-size:13px;color:#713f12;">⚠️ This link expires in <strong>1 hour</strong>. If you didn't request this, please ignore this email — your password won't change.</p>
        </div>
        <div style="background:#f9fafb;border-radius:10px;padding:16px;margin-top:16px;">
          <p style="margin:0;font-size:13px;color:#71717a;">Link not working? Copy and paste:</p>
          <p style="margin:8px 0 0 0;font-size:12px;color:#1d4ed8;word-break:break-all;">{reset_url}</p>
        </div>
        """
        return _BASE.format(title="Reset your password", content=content)

    @staticmethod
    def password_reset_success(full_name: str, app_url: str) -> str:
        content = f"""
        {_badge("✓ Success", "#15803d", "#dcfce7")}
        {_h1("Password reset successful")}
        {_p(f"Hi {full_name}, your password has been successfully updated.")}
        <div style="background:#f0fdf4;border-radius:10px;padding:20px;border-left:4px solid #22c55e;margin:24px 0;">
          <p style="margin:0;font-size:14px;color:#15803d;font-weight:500;">✓ Your account is secured with a new password.</p>
        </div>
        {_p("If you didn't make this change, please contact us immediately by replying to this email.")}
        <div style="text-align:center;">
          {_BTN.format(url=app_url+"/login", color="#18181b", label="Login to your account")}
        </div>
        """
        return _BASE.format(title="Password reset successful", content=content)

    @staticmethod
    def workspace_invitation(
        invitee_name: str,
        inviter_name: str,
        workspace_name: str,
        role: str,
        accept_url: str,
    ) -> str:
        content = f"""
        {_badge("Team invitation", "#7c3aed", "#f5f3ff")}
        {_h1(f"You're invited to join {workspace_name}")}
        {_p(f"Hi {invitee_name}, <strong>{inviter_name}</strong> has invited you to join <strong>{workspace_name}</strong> on Deenx AI.")}
        <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:24px 0;border:1px solid #e4e4e7;">
          <table width="100%" cellpadding="0" cellspacing="0">
            {_info_row("Workspace", workspace_name)}
            {_info_row("Your role", role.title())}
            {_info_row("Invited by", inviter_name)}
          </table>
        </div>
        <div style="text-align:center;">
          {_BTN.format(url=accept_url, color="#7c3aed", label="Accept Invitation")}
        </div>
        {_p("This invitation expires in <strong>7 days</strong>.", muted=True)}
        """
        return _BASE.format(title=f"Invitation to {workspace_name}", content=content)

    @staticmethod
    def subscription_expiry(
        full_name: str,
        workspace_name: str,
        expiry_date: str,
        plan: str,
        upgrade_url: str,
    ) -> str:
        content = f"""
        {_badge("⚠️ Action needed", "#b45309", "#fef3c7")}
        {_h1("Your subscription expires soon")}
        {_p(f"Hi {full_name}, your <strong>{plan}</strong> plan for <strong>{workspace_name}</strong> expires on <strong>{expiry_date}</strong>.")}
        <div style="background:#fefce8;border-radius:12px;padding:20px;margin:24px 0;border:1px solid #fde047;">
          <p style="margin:0;font-size:14px;color:#713f12;">After expiry, your bots will stop responding and campaigns will be paused. Renew now to avoid any disruption.</p>
        </div>
        {_divider_section([
            ("🤖", "Bot automation stops", "Flows and chatbot rules will be disabled"),
            ("📢", "Campaigns paused", "Scheduled broadcasts won't go out"),
            ("📥", "Inbox read-only", "You can view but not send messages"),
        ], icon_color="#b45309", bg="#fef3c7")}
        <div style="text-align:center;">
          {_BTN.format(url=upgrade_url, color="#d97706", label="Renew Subscription →")}
        </div>
        """
        return _BASE.format(title="Subscription expiring soon", content=content)

    @staticmethod
    def invoice(
        full_name: str,
        invoice_number: str,
        amount: str,
        plan: str,
        period: str,
        invoice_url: str,
    ) -> str:
        content = f"""
        {_badge("Invoice", "#0f172a", "#f1f5f9")}
        {_h1(f"Invoice #{invoice_number}")}
        {_p(f"Hi {full_name}, your payment has been received. Here's your invoice summary.")}
        <div style="background:#f9fafb;border-radius:12px;padding:20px;margin:24px 0;border:1px solid #e4e4e7;">
          <table width="100%" cellpadding="0" cellspacing="0">
            {_info_row("Invoice number", f"#{invoice_number}")}
            {_info_row("Plan", plan)}
            {_info_row("Billing period", period)}
            {_info_row("Amount paid", f"<strong style='color:#15803d;font-size:16px;'>{amount}</strong>")}
          </table>
        </div>
        <div style="background:#f0fdf4;border-radius:10px;padding:16px;margin-bottom:24px;">
          <p style="margin:0;font-size:14px;color:#15803d;font-weight:500;">✓ Payment received — your subscription is active.</p>
        </div>
        <div style="text-align:center;">
          {_BTN.format(url=invoice_url, color="#18181b", label="Download Invoice PDF")}
        </div>
        {_p("Keep this email for your records. For billing questions, reply to this email.", muted=True)}
        """
        return _BASE.format(title=f"Invoice #{invoice_number}", content=content)


def _divider_section(items, icon_color="#18181b", bg="#f9fafb"):
    rows = ""
    for icon, title, desc in items:
        rows += f"""
        <tr>
          <td style="padding:12px 0;vertical-align:top;width:48px;">
            <div style="width:40px;height:40px;background:{bg};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;text-align:center;line-height:40px;">{icon}</div>
          </td>
          <td style="padding:12px 0 12px 16px;vertical-align:top;">
            <p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#09090b;">{title}</p>
            <p style="margin:0;font-size:13px;color:#71717a;">{desc}</p>
          </td>
        </tr>"""
    return f"""
    {_DIVIDER}
    <table width="100%" cellpadding="0" cellspacing="0">{rows}</table>
    {_DIVIDER}
    """