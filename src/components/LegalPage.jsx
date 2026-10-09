import React from "react";

export default function LegalPage({ pageType = "dmca", onNavigateHome, onSelectLegalPage }) {
  return (
    <div className="legal-page-container">
      {/* Dynamic Content based on pageType */}
      {pageType === "dmca" && (
        <div className="legal-content-wrap">
          <h1 className="legal-page-title">DMCA</h1>
          <div className="legal-card-box">
            <h2 className="legal-subtitle">We collect all those videos from</h2>
            <ul className="legal-sources-list">
              <li>*xhamster</li>
              <li>*xvideos</li>
              <li>*pornhub</li>
              <li>*dropmms</li>
              <li>*mmsbee</li>
              <li>*xossipy</li>
              <li>*masaladesi</li>
            </ul>

            <p className="legal-para">
              If you have any problem with any video then please mail us immediately and we will remove as soon as possible without any Question. Please don't mail to Cyber Crime department or any Police station. without contacting us first.
            </p>

            <p className="legal-para">
              Note:if you report against tango,cam,webseries videos it take delay or maybe we ignore your request(its rare).We need 24hours for removed copyright content .We removed immediate desi amature videos and any type un-der-age video that maybe posted by mistake.
            </p>

            <p className="legal-mail-highlight">
              Mail us: <a href="mailto:viralkam.com@gmail.com" className="legal-email-link">viralkam.com@gmail.com</a>
            </p>
          </div>
        </div>
      )}

      {pageType === "compliance" && (
        <div className="legal-content-wrap">
          <h1 className="legal-page-title">18 U.S.C 2257</h1>
          <div className="legal-card-box">
            <p className="legal-para">
              Viralkam.com is not a producer (primary or secondary) of any or all of the content found on the website. With respect to the records as per 18 USC 2257 for the content found on this site, please kindly direct your request to the site for which the content was produced.
            </p>

            <p className="legal-para">
              Viralkam.com is a live video sharing site which allows the general viewing of various types of content.
            </p>

            <p className="legal-para">
              Viralkam.com abides by the following procedures to ensure compliance:
            </p>

            <p className="legal-para">
              We require all users to be 18+ years of age to upload videos.
            </p>

            <p className="legal-para">
              Users must affirm that they are 18+ years of age and affirm that they keep records of the videos in the content and that they are over 18 years of age.
            </p>

            <p className="legal-mail-highlight">
              Mail us: <a href="mailto:viralkam.com@gmail.com" className="legal-email-link">viralkam.com@gmail.com</a>
            </p>
          </div>
        </div>
      )}

      {pageType === "terms" && (
        <div className="legal-content-wrap">
          <h1 className="legal-page-title">Terms of Use</h1>
          <div className="legal-card-box">
            <p className="legal-para">
              By using or visiting our site, you agree to the terms and conditions contained herein and all future amendments and modifications.
            </p>

            <p className="legal-para">
              These terms and conditions are subject to change at any time and you agree be bound by all modifications, changes and revisions. If you do not agree, then don't use our site.
            </p>

            <p className="legal-para">
              Our website allows for uploading, sharing and general viewing various types of content allowing registered and unregistered users to share and view adult content, including sexually explicit images and video.
            </p>

            <p className="legal-para">
              The website may also contain certain links to third party websites which are in no way owned or controlled by us. We assume no responsibility for the content, privacy policies, practices of any third party websites. We cannot censor or edit the content of third party sites. You acknowledge that we will not be liable for any liability arising from your use of any third party website.
            </p>

            <p className="legal-para">
              You affirm that you are at least eighteen (18) years of age and/or over the age of majority in the jurisdiction you reside and from which you access the website if the age of majority is greater than eighteen (18) years of age. If you are under the age of 18 and/or under the age of majority in the jurisdiction you reside and from which you access the website, then you are not permitted to use the website.
            </p>

            <p className="legal-para">
              You agree that you will not post any content that is illegal, unlawful, harassing, harmful, threatening, abusive, defamatory, obscene, libelous, hateful, or racial.
            </p>

            <p className="legal-para">
              You also agree that you shall not post, upload or publish any material that contains viruses or any code designed to destroy, interrupt, limit the functionality of, or monitor any computer.
            </p>

            <p className="legal-para">
              You agree that you will not post, upload nor publish content which is intentionally or unintentionally violating any applicable local, state, national, or international law.
            </p>

            <p className="legal-para">
              You agree that you will not post, upload or publish content depicting illegal activity nor depict any act of cruelty to animals; You agree not to use our site in any way that might expose us to criminal or civil liability.
            </p>

            <p className="legal-para">
              The content on our site cannot be used, copied, reproduced, distributed, transmitted, broadcast, displayed, sold, licensed, or otherwise exploited for any other purpose whatsoever without our prior written consent.
            </p>

            <p className="legal-para">
              In submitting a video to our site, you agree that you will not submit material that is copyrighted or subject to third party proprietary rights, nor submit material that is obscene, illegal, unlawful, defamatory, libelous, harassing, hateful or encourages conduct that would be considered a criminal offense.
            </p>

            <p className="legal-mail-highlight">
              Mail us: <a href="mailto:viralkam.com@gmail.com" className="legal-email-link">viralkam.com@gmail.com</a>
            </p>
          </div>
        </div>
      )}

      {/* Footer matching exact reference */}
      <footer className="legal-footer-bottom">
        <div className="footer-links-row">
          <button className="footer-nav-link" onClick={() => onSelectLegalPage("dmca")}>
            DMCA — Remove A Video
          </button>
          <span className="sep-divider">|</span>
          <button className="footer-nav-link" onClick={() => onSelectLegalPage("compliance")}>
            18 U.S.C 2257
          </button>
          <span className="sep-divider">|</span>
          <button className="footer-nav-link" onClick={() => onSelectLegalPage("terms")}>
            Terms of Use
          </button>
        </div>
        <p className="footer-copyright-text">
          2026 - VIRALKAM.COM. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
