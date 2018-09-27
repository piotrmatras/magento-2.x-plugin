define([
        'jquery',
        'underscore',
        'ko',
        'Magento_Checkout/js/view/payment/default',
        'Magento_Checkout/js/action/select-payment-method',
        'mage/url',
        'BlueMedia_BluePayment/js/model/quote',
        'BlueMedia_BluePayment/js/checkout-data'
    ], function ($,
                 _,
                 ko,
                 Component,
                 selectPaymentMethodAction,
                 url,
                 quote,
                 checkoutData) {
        'use strict';
        var widget;
        var redirectUrl;
        return Component.extend({
            redirectAfterPlaceOrder: false,
            renderSubOptions: window.checkoutConfig.payment.bluePaymentOptions,
            renderSeparatedOptions: window.checkoutConfig.payment.bluePaymentSeparated,
            selectedPaymentObject: {},
            validationFailed: ko.observable(false),
            activeMethod: ko.computed(function () {
                if (checkoutData.getBlueMediaPaymentMethod() && quote.paymentMethod()) {
                    if (quote.paymentMethod().method === 'bluepayment') {
                        return checkoutData.getBlueMediaPaymentMethod().gateway_id;
                    }
                }
                return -1;
            }),
            /**
             * Get payment method data
             */
            getData: function () {
                return {
                    "method": this.item.method,
                    "po_number": null,
                    "additional_data": null
                };
            },
            initialize: function (config) {
                var self = this;
                widget = this;
                this._super();

                var blueMediaPayment = checkoutData.getBlueMediaPaymentMethod();
                if (blueMediaPayment && quote.paymentMethod()) {
                    if (quote.paymentMethod().method === 'bluepayment') {
                        this.selectedPaymentObject = blueMediaPayment;
                    }
                }

                ko.bindingHandlers.doSomething = {
                    update: function (element) {
                        var el = $(element).find('input.radio');
                        el.change(function () {
                            el.parent().removeClass('_active');
                            $(this).parent().addClass('_active');
                        });
                    }
                };
                ko.bindingHandlers.addActiveClass = {
                    init: function (element) {
                        var el = $(element);
                        var checkboxes = el.find('input');
                        checkboxes.each(function () {
                            if ($(this).is(':checked')) {
                                $(this).parent().addClass('_active');
                            }
                        });
                    }
                };

                PayBmCheckout.transactionSuccess = function(status) {
                    window.location.href = redirectUrl;
                };

                PayBmCheckout.transactionDeclined = function(status) {
                    window.location.href = redirectUrl;
                };

                PayBmCheckout.transactionError = function(status) {
                    window.location.href = redirectUrl;
                };
            },
            defaults: {
                template: 'BlueMedia_BluePayment/payment/bluepayment',
                logoUrl: window.checkoutConfig.payment.bluePaymentLogo || 'https://bm.pl/img/www/logos/bmLogo.png',
            },
            selectPaymentOption: function (value) {
                widget.setBlueMediaGatewayMethod(value);
                return true;
            },
            selectPaymentMethod: function () {
                this.item.individual_gateway = null;
                checkoutData.setIndividualGatewayFlag(this.item.individual_gateway);
                selectPaymentMethodAction(this.getData());
                checkoutData.setSelectedPaymentMethod(this.item.method);
                checkoutData.setIndividualGatewayFlag('');
                this.setBlueMediaGatewayMethod({});

                return true;
            },
            selectCardPaymentMethod: function () {
                selectPaymentMethodAction(this.getData());
                checkoutData.setSelectedPaymentMethod(this.item.method);
                return true;
            },
            selectPaymentMethodCard: function (cardContext) {
                this.item.individual_gateway = cardContext.gateway_id;
                checkoutData.setIndividualGatewayFlag(this.item.individual_gateway);

                this.setBlueMediaGatewayMethod(cardContext);
                this.selectCardPaymentMethod();

                return true;
            },
            setBlueMediaGatewayMethod: function (value) {
                this.validationFailed(false);
                this.selectedPaymentObject = value;

                quote.setBlueMediaPaymentMethod(value);
                checkoutData.setBlueMediaPaymentMethod(value);
            },
            isChecked: ko.computed(function () {
                var paymentMethod = quote.paymentMethod();
                if (paymentMethod) {
                    return checkoutData.getIndividualGatewayFlag() ? false : paymentMethod.method;
                }
                return null;
            }),
            isSeparatedChecked: function (context) {
                return ko.pureComputed(function () {
                    var paymentMethod = quote.paymentMethod();
                    var individualFlag = checkoutData.getIndividualGatewayFlag();
                    if (paymentMethod) {
                        if (individualFlag && paymentMethod.method == 'bluepayment') {
                            if (individualFlag == context.gateway_id) {
                                return individualFlag;
                            }

                            return false;

                        } else {
                            return false;
                        }
                    }
                    return null;
                });
            },
            isIframeSelected: function() {
                return this.selectedPaymentObject.is_iframe;
            },
            isBlikSelected: function() {
                return this.selectedPaymentObject.is_blik;
            },
            /**
             * @return {Boolean}
             */
            validate: function () {
                $('.blik-error').hide();

                if (_.isEmpty(this.selectedPaymentObject)) {
                    this.validationFailed(true);
                    return false;
                }

                // Add code validation if BLIK is selected./
                if (this.isBlikSelected()) {
                    var code = $(".blue-payment__blik input[name='payment_method_bluepayment_code']").val();
                    if (code.length !== 6) {
                        $('.blik-error').show();
                        return false;
                    }
                }

                return true;
            },
            afterPlaceOrder: function () {
                if (this.isIframeSelected()) {
                    this.callIframePayment();
                    return false;
                }

                if (this.isBlikSelected()) {
                    this.callBlikPayment();
                    return false;
                }

                window.location.href = url.build('bluepayment/processing/create') + '?gateway_id=' + this.selectedPaymentObject.gateway_id;
            },
            callIframePayment: function() {
                var urlResponse = url.build('bluepayment/processing/create')
                    + '?gateway_id='
                    + this.selectedPaymentObject.gateway_id
                    + '&automatic=true';

                $.ajax({
                    showLoader: true,
                    url: urlResponse,
                    type: "GET",
                    dataType: "json",
                }).done(function (response) {
                    redirectUrl = url.build('bluepayment/processing/back') + '?ServiceID=' + response.params.ServiceID + '&OrderID=' + response.params.OrderID + '&Hash=' + response.redirectHash;

                    PayBmCheckout.actionURL = response.gateway_url;
                    PayBmCheckout.transactionStartByParams(response.params);
                });

                return false;
            },
            callBlikPayment: function() {
                var urlResponse = url.build('bluepayment/processing/create')
                    + '?gateway_id='
                    + this.selectedPaymentObject.gateway_id
                    + '&automatic=true';
                var code = $(".blue-payment__blik input[name='payment_method_bluepayment_code']").val();

                if (code.length === 6) {
                    $.ajax({
                        showLoader: true,
                        url: urlResponse,
                        data: {'code': code},
                        type: "POST",
                        dataType: "json",
                    }).done(function (response) {
                        if (response.status && response.status == false) {
                            alert('Status = false');
                        } else {
                            redirectUrl = url.build('bluepayment/processing/backblick')
                                + '?ServiceID=' + response.params.ServiceID
                                + '&OrderID=' + response.params.OrderID
                                + '&Hash=' + response.params.hash
                                + '&paymentStatus=' + response.params.paymentStatus;
                            window.location.href = redirectUrl;
                        }
                    });
                }

                return false;
            }
        });
    }
);