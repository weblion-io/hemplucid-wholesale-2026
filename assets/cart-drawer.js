/* global SideDrawer */

class CartDrawer extends SideDrawer {
  connectedCallback() {
    this.bindEvents();
  }

  bindEvents() {
    this.openDrawerViaEventHandler = this.handleDrawerOpenViaEvent.bind(this);
    this.closeDrawerViaEventHandler = this.close.bind(this, null);
    document.addEventListener('dispatch:cart-drawer:open', this.openDrawerViaEventHandler);
    document.addEventListener('dispatch:cart-drawer:close', this.closeDrawerViaEventHandler);
    document.addEventListener('dispatch:cart-drawer:refresh', this.cartRefreshHandler);
    this.addEventListener('on:cart-drawer:before-open', () => {
      theme.manuallyLoadImages(this);
      this.querySelectorAll('cc-cart-cross-sell').forEach((el) => el.init());
    });
    this.addEventListener('on:cart:after-merge', () => {
      theme.manuallyLoadImages(this);
      this.querySelectorAll('cc-cart-cross-sell').forEach((el) => el.init());
    });
  }

  disconnectedCallback() {
    document.removeEventListener('dispatch:cart-drawer:refresh', this.cartRefreshHandler);
    document.removeEventListener('dispatch:cart-drawer:open', this.openDrawerViaEventHandler);
    document.removeEventListener('dispatch:cart-drawer:close', this.closeDrawerViaEventHandler);
  }

  /**
   * Handle when the drawer is opened via an event
   * @param {object} evt - Event object.
   */
  handleDrawerOpenViaEvent(evt) {
    this.open(evt.detail ? evt.detail.opener : null);
  }

  /**
   * Trigger refresh of contents
   */
  cartRefreshHandler() {
    this.querySelector('cart-form').refresh();
  }

  /**
   * Update section's cart-form element with new contents
   * @param {string} html - Whole-section HTML.
   */
  updateFromCartChange(html) {
    this.querySelector('cart-form').refreshFromHtml(html);
  }
}

window.customElements.define('cart-drawer', CartDrawer);

document.addEventListener('change', async function (e) {
  const isCheckbox = e.target.matches('.product-details-sub input[type="checkbox"]');
  const isSelect = e.target.matches('.product-details-sub .cart-subscription_select');
  if (!isCheckbox && !isSelect) return;

  const wrapper = e.target.closest('.product-details-sub');
  const cartItem = wrapper?.closest('.cart-item');
  if (!wrapper || !cartItem) return;

  const checkbox = wrapper.querySelector('input[type="checkbox"]');
  const select = wrapper.querySelector('.cart-subscription_select');
  const bottom = wrapper.querySelector('.cart-subscription-bottom');
  const qtyInput = cartItem.querySelector('.cart-item__quantity-input');

  const variantId = wrapper.dataset.cartVar;
  const lineKey = qtyInput?.dataset.key;
  const quantity = qtyInput ? parseInt(qtyInput.value, 10) : 1;
  if (!variantId || !lineKey) return;

  const isSubscribed = checkbox.checked;
  const sellingPlanId = isSubscribed ? select.value : null;

  // optimistic UI update
  if (bottom) bottom.classList.toggle('active', isSubscribed);
  checkbox.disabled = true;
  select.disabled = true;

  try {
    // 1. remove the existing line
    await fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lineKey, quantity: 0 })
    });

    // 2. re-add with or without the selling plan
    const payload = { items: [{ id: variantId, quantity }] };
    if (sellingPlanId) payload.items[0].selling_plan = sellingPlanId;

    const addResponse = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!addResponse.ok) throw new Error('Cart update failed');

    // 3. refresh the section so Liquid re-renders
    await refreshCartSection();

  } catch (err) {
    console.error('Error updating subscription:', err);
    checkbox.checked = !isSubscribed;
    if (bottom) bottom.classList.toggle('active', !isSubscribed);
  } finally {
    checkbox.disabled = false;
    select.disabled = false;
  }
});

async function refreshCartSection() {
  // find the Shopify section wrapper that contains the cart item list
  const bodyEl = document.querySelector('.cart-item-list__body');
  const sectionEl = bodyEl?.closest('[id^="shopify-section-"]');
  if (!sectionEl) {
    console.error('Could not locate parent shopify-section wrapper');
    return;
  }
  const sectionId = sectionEl.id.replace('shopify-section-', '');

  const response = await fetch(`${window.location.pathname}?section_id=${sectionId}`);
  const text = await response.text();
  const parsed = new DOMParser().parseFromString(text, 'text/html');

  const freshBody = parsed.querySelector('.cart-item-list__body');
  const currentBody = document.querySelector('.cart-item-list__body');

  const freshFooter = parsed.querySelector('.cart-drawer__footer');
  const currentFooter = document.querySelector('.cart-drawer__footer');
  
  if (freshBody && currentBody) {
    currentBody.innerHTML = freshBody.innerHTML;
  }
  if (freshFooter && currentFooter) {
    currentFooter.innerHTML = freshFooter.innerHTML;
  }
}

document.addEventListener('click', function (e) {
  const tooltip = e.target.closest('.cart_tooltip');

  if (tooltip) {
    e.preventDefault();
    const tooltipSpan = tooltip.nextElementSibling;
    if (tooltipSpan && tooltipSpan.classList.contains('cart_subscriptionTooltip')) {
      tooltipSpan.classList.toggle('active');
    }
    return;
  }

  document.querySelectorAll('.cart_subscriptionTooltip.active').forEach((el) => {
    el.classList.remove('active');
  });
});

/***********************************************************************************
 * 
 * 
 *      Figure out why images don't load on subscription box change
 * 
 *      Also, look into why You May Also Like section has sale pricing and 
 *      looks weird on PDPs
 * 
 *      Look at Main.js for function that currectly updates all cart on qty change
 *      and see if we can tie into that.
 * 
 *      fix desktop width of Shop All mega menu
 * 
 * 
 ***********************************************************************************/